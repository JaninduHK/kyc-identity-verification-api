import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config, logger } from './config';

export const TASK_QUEUE = 'kestrel-kyc';

async function main(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: config.TEMPORAL_ADDRESS,
  });

  try {
    const worker = await Worker.create({
      connection,
      namespace: config.TEMPORAL_NAMESPACE,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });

    logger.info(
      { taskQueue: TASK_QUEUE, namespace: config.TEMPORAL_NAMESPACE, address: config.TEMPORAL_ADDRESS },
      'orchestrator worker starting',
    );

    await worker.run();
  } finally {
    await connection.close();
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'worker terminated unexpectedly');
  process.exit(1);
});
