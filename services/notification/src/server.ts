import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { config, logger } from './config';
import { deliverWebhook } from './webhook';
import { sendEmail } from './email';
import { sendSMS } from './sms';
import type { EmailRequest, SMSRequest, WebhookDelivery } from './models';

const app = Fastify({ logger: false });

app.get('/health', async () => {
  return { status: 'ok', service: 'notification', version: '0.1.0' };
});

app.get('/ready', async () => {
  return { status: 'ready' };
});

app.post('/internal/webhook/deliver', async (request: FastifyRequest) => {
  const body = request.body as WebhookDelivery;
  return deliverWebhook(body);
});

app.post('/internal/email/send', async (request: FastifyRequest) => {
  const body = request.body as EmailRequest;
  return sendEmail(body);
});

app.post('/internal/sms/send', async (request: FastifyRequest) => {
  const body = request.body as SMSRequest;
  return sendSMS(body);
});

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
