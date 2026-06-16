import crypto from 'node:crypto';
import axios, { AxiosError } from 'axios';
import { config, logger } from './config';
import type { WebhookDelivery } from './models';

const RETRY_DELAYS = [30, 120, 600, 3600, 86400];

export interface WebhookResult {
  delivered: boolean;
  statusCode?: number;
  nextRetry?: number;
}

export async function deliverWebhook(
  delivery: WebhookDelivery
): Promise<WebhookResult> {
  const body = JSON.stringify(delivery.payload);
  const signature = crypto
    .createHmac('sha256', config.WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  const attempt = delivery.attempt ?? 0;

  try {
    const response = await axios.post(delivery.url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Kestrel-Signature': `sha256=${signature}`,
      },
      timeout: 10_000,
    });

    if (response.status >= 200 && response.status < 300) {
      logger.info(
        { sessionId: delivery.sessionId, statusCode: response.status },
        'Webhook delivered'
      );
      return { delivered: true, statusCode: response.status };
    }

    const nextRetry = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
    return { delivered: false, statusCode: response.status, nextRetry };
  } catch (err) {
    const nextRetry = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
    let statusCode: number | undefined;
    if (err instanceof AxiosError) {
      statusCode = err.response?.status;
    }
    logger.error(
      { err, sessionId: delivery.sessionId, attempt, nextRetry },
      'Webhook delivery failed'
    );
    const result: WebhookResult = { delivered: false, nextRetry };
    if (statusCode !== undefined) {
      result.statusCode = statusCode;
    }
    return result;
  }
}
