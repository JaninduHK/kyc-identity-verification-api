import crypto from 'node:crypto';
import axios, { AxiosError } from 'axios';
import { config, logger } from './config';
import type { WebhookDelivery } from './models';
import type { WebhookStore } from './store';

// Exponential-ish backoff schedule (seconds): 30s, 2m, 10m, 1h, 24h.
export const RETRY_DELAYS = [30, 120, 600, 3600, 86400];

export interface WebhookResult {
  delivered: boolean;
  statusCode?: number;
  nextRetry?: number;
}

/** HMAC-SHA256 of the exact serialized body, matching the X-Kestrel-Signature. */
export function signPayload(body: string): string {
  return crypto
    .createHmac('sha256', config.WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
}

/**
 * Seconds until the next retry given how many attempts have already been made,
 * or null when the max is reached (give up). attemptsMade is 1 after the first
 * delivery attempt.
 */
export function backoffSeconds(
  attemptsMade: number,
  maxAttempts: number
): number | null {
  if (attemptsMade >= maxAttempts) {
    return null;
  }
  const idx = Math.min(Math.max(attemptsMade - 1, 0), RETRY_DELAYS.length - 1);
  return RETRY_DELAYS[idx];
}

interface AttemptOutcome {
  delivered: boolean;
  statusCode?: number;
}

/** A single HTTP delivery attempt. Never throws; maps failures to an outcome. */
export async function attemptDelivery(
  url: string,
  body: string,
  signature: string
): Promise<AttemptOutcome> {
  try {
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Kestrel-Signature': `sha256=${signature}`,
      },
      timeout: 10_000,
      // Resolve (don't throw) for any status so we classify it ourselves.
      validateStatus: () => true,
    });
    return {
      delivered: response.status >= 200 && response.status < 300,
      statusCode: response.status,
    };
  } catch (err) {
    let statusCode: number | undefined;
    if (err instanceof AxiosError) {
      statusCode = err.response?.status;
    }
    const outcome: AttemptOutcome = { delivered: false };
    if (statusCode !== undefined) {
      outcome.statusCode = statusCode;
    }
    return outcome;
  }
}

/**
 * Deliver a webhook once and, when a store is provided, persist the attempt so
 * the background retry worker can re-attempt failures with backoff.
 */
export async function deliverWebhook(
  delivery: WebhookDelivery,
  store: WebhookStore | null
): Promise<WebhookResult> {
  const body = JSON.stringify(delivery.payload);
  const signature = signPayload(body);
  const attemptsMade = (delivery.attempt ?? 0) + 1;

  const outcome = await attemptDelivery(delivery.url, body, signature);

  if (outcome.delivered) {
    logger.info(
      { sessionId: delivery.sessionId, statusCode: outcome.statusCode },
      'Webhook delivered'
    );
  } else {
    logger.error(
      {
        sessionId: delivery.sessionId,
        statusCode: outcome.statusCode,
        attempt: attemptsMade,
      },
      'Webhook delivery failed'
    );
  }

  const nextRetrySec = outcome.delivered
    ? null
    : backoffSeconds(attemptsMade, config.WEBHOOK_MAX_ATTEMPTS);

  if (store) {
    try {
      await store.record({
        sessionId: delivery.sessionId,
        url: delivery.url,
        payload: delivery.payload,
        attempt: attemptsMade,
        ...(outcome.statusCode !== undefined
          ? { statusCode: outcome.statusCode }
          : {}),
        delivered: outcome.delivered,
        nextRetrySec,
      });
    } catch (err) {
      logger.error(
        { err, sessionId: delivery.sessionId },
        'failed to persist webhook delivery'
      );
    }
  }

  const result: WebhookResult = { delivered: outcome.delivered };
  if (outcome.statusCode !== undefined) {
    result.statusCode = outcome.statusCode;
  }
  if (nextRetrySec !== null) {
    result.nextRetry = nextRetrySec;
  }
  return result;
}
