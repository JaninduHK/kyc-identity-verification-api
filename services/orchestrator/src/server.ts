import express, { type Request, type Response } from 'express';
import { config, logger } from './config';
import { getTemporalClient, startVerification, getWorkflowStatus } from './client';
import type { CDDInput, WorkflowType } from './types';

interface ErrorBody {
  error: string;
  message: string;
  statusCode: number;
}

function errorBody(error: string, message: string, statusCode: number): ErrorBody {
  return { error, message, statusCode };
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isWorkflowType(value: unknown): value is WorkflowType {
  return value === 'cdd' || value === 'edd';
}

interface StartRequestBody extends Partial<CDDInput> {
  workflowType?: unknown;
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'orchestrator', version: '0.1.0' });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      const client = await getTemporalClient();
      await client.connection.workflowService.getSystemInfo({});
      res.json({ status: 'ready' });
    } catch (err) {
      logger.warn({ err }, 'readiness check failed');
      res.status(503).json(errorBody('not_ready', toMessage(err), 503));
    }
  });

  app.post('/internal/verify/start', async (req: Request, res: Response) => {
    try {
      const body = req.body as StartRequestBody;
      const workflowType: WorkflowType = isWorkflowType(body.workflowType)
        ? body.workflowType
        : 'cdd';

      if (
        typeof body.sessionId !== 'string' ||
        typeof body.clientId !== 'string' ||
        typeof body.nicImageBase64 !== 'string' ||
        typeof body.country !== 'string'
      ) {
        res
          .status(400)
          .json(
            errorBody(
              'invalid_request',
              'sessionId, clientId, nicImageBase64 and country are required',
              400,
            ),
          );
        return;
      }

      const input: CDDInput = {
        sessionId: body.sessionId,
        clientId: body.clientId,
        nicImageBase64: body.nicImageBase64,
        selfieBase64: body.selfieBase64,
        name: body.name,
        dob: body.dob,
        country: body.country,
        ipAddress: body.ipAddress,
        webhookUrl: body.webhookUrl,
      };

      const { workflowId, runId } = await startVerification(input, workflowType);
      res.status(202).json({ workflowId, runId, sessionId: input.sessionId });
    } catch (err) {
      logger.error({ err }, 'failed to start verification');
      res.status(500).json(errorBody('start_failed', toMessage(err), 500));
    }
  });

  app.get('/internal/sessions/:id', async (req: Request, res: Response) => {
    try {
      const description = await getWorkflowStatus(req.params.id);
      res.json({
        sessionId: req.params.id,
        workflowId: description.workflowId,
        runId: description.runId,
        status: description.status.name,
        startTime: description.startTime,
        closeTime: description.closeTime,
      });
    } catch (err) {
      logger.error({ err, sessionId: req.params.id }, 'failed to fetch session status');
      res.status(404).json(errorBody('not_found', toMessage(err), 404));
    }
  });

  return app;
}

async function main(): Promise<void> {
  const app = createApp();
  app.listen(config.ORCHESTRATOR_PORT, () => {
    logger.info({ port: config.ORCHESTRATOR_PORT }, 'orchestrator server listening');
  });
}

if (require.main === module) {
  main().catch((err: unknown) => {
    logger.fatal({ err }, 'server terminated unexpectedly');
    process.exit(1);
  });
}
