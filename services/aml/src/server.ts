import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { config, logger } from './config';
import { screenIndividual } from './screening';
import type { AMLScreenRequest } from './models';

const app = Fastify({ logger: false });

app.get('/health', async () => {
  return { status: 'ok', service: 'aml', version: '0.1.0' };
});

app.get('/ready', async () => {
  return { status: 'ready' };
});

app.post('/internal/screen', async (request: FastifyRequest) => {
  const body = request.body as AMLScreenRequest;
  const result = await screenIndividual(body);
  return result;
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
    await app.listen({ port: config.AML_PORT, host: '0.0.0.0' });
    logger.info({ port: config.AML_PORT }, 'AML service listening');
  } catch (err) {
    logger.error({ err }, 'Failed to start AML service');
    process.exit(1);
  }
}

void start();
