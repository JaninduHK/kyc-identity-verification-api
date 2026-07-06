import axios from 'axios';
import { config, logger } from '../config';

export async function fireWebhook(input: {
  sessionId: string;
  url: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await axios.post(`${config.NOTIFICATION_URL}/internal/webhook/deliver`, {
      sessionId: input.sessionId,
      url: input.url,
      payload: input.payload,
    });
  } catch (err) {
    // Rethrow so Temporal retries the hand-off to the notification service,
    // which itself performs durable retries of the actual delivery.
    logger.error({ err, sessionId: input.sessionId, url: input.url }, 'webhook delivery failed');
    throw err;
  }
}
