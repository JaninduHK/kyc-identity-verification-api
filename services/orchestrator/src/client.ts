import { Client, Connection, type WorkflowExecutionDescription } from '@temporalio/client';
import { config, logger } from './config';
import type { CDDInput, WorkflowType } from './types';
import { TASK_QUEUE } from './worker';

let cachedClient: Client | undefined;

export async function getTemporalClient(): Promise<Client> {
  if (cachedClient !== undefined) {
    return cachedClient;
  }
  const connection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
  cachedClient = new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
  logger.info(
    { address: config.TEMPORAL_ADDRESS, namespace: config.TEMPORAL_NAMESPACE },
    'temporal client connected',
  );
  return cachedClient;
}

export async function startVerification(
  input: CDDInput,
  workflowType: WorkflowType,
): Promise<{ workflowId: string; runId: string }> {
  const client = await getTemporalClient();
  const workflowName = workflowType === 'edd' ? 'eddWorkflow' : 'cddWorkflow';
  const workflowId = `verify-${input.sessionId}`;

  const handle = await client.workflow.start(workflowName, {
    args: [input],
    taskQueue: TASK_QUEUE,
    workflowId,
  });

  return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
}

export async function getWorkflowStatus(sessionId: string): Promise<WorkflowExecutionDescription> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`verify-${sessionId}`);
  return handle.describe();
}
