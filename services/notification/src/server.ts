import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { config, logger } from './config';
import { deliverWebhook } from './webhook';
import { sendEmail } from './email';
import { sendSMS } from './sms';
import { createStore } from './store';
import { startRetryWorker } from './retry-worker';
import type { EmailRequest, SMSRequest, WebhookDelivery } from './models';

const app = Fastify({ logger: false });

const store = createStore();

app.get('/health', async () => {
  return { status: 'ok', service: 'notification', version: '0.1.0' };
});

app.get('/ready', async () => {
  return { status: 'ready' };
});

const webhookSchema = {
  body: {
    type: 'object',
    required: ['sessionId', 'url', 'payload'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      url: { type: 'string', format: 'uri' },
      payload: { type: 'object' },
      attempt: { type: 'integer', minimum: 0 },
    },
  },
};

app.post(
  '/internal/webhook/deliver',
  { schema: webhookSchema },
  async (request: FastifyRequest) => {
    const body = request.body as WebhookDelivery;
    return deliverWebhook(body, store);
  }
);

const emailSchema = {
  body: {
    type: 'object',
    required: ['to', 'subject', 'body'],
    properties: {
      to: { type: 'string', minLength: 1 },
      subject: { type: 'string' },
      body: { type: 'string' },
      html: { type: 'string' },
    },
  },
};

app.post(
  '/internal/email/send',
  { schema: emailSchema },
  async (request: FastifyRequest) => {
    const body = request.body as EmailRequest;
    return sendEmail(body);
  }
);

const smsSchema = {
  body: {
    type: 'object',
    required: ['to', 'message'],
    properties: {
      to: { type: 'string', minLength: 1 },
      message: { type: 'string', minLength: 1 },
    },
  },
};

app.post(
  '/internal/sms/send',
  { schema: smsSchema },
  async (request: FastifyRequest) => {
    const body = request.body as SMSRequest;
    return sendSMS(body);
  }
);

app.setErrorHandler(
  (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;
    logger.error({ err: error }, 'Request error');
    void reply.status(statusCode).send({
      error: error.code ?? 'internal_error',
      message: error.message,
      statusCode,
    });
  }
);

async function start(): Promise<void> {
  const stopWorker = startRetryWorker(store);

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Notification service shutting down');
    stopWorker();
    void app.close().then(async () => {
      if (store) {
        await store.close();
      }
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.NOTIFICATION_PORT, host: '0.0.0.0' });
    logger.info(
      { port: config.NOTIFICATION_PORT },
      'Notification service listening'
    );
  } catch (err) {
    logger.error({ err }, 'Failed to start notification service');
    process.exit(1);
  }
}

void start();
