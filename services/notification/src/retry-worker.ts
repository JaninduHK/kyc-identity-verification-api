import { config, logger } from './config';
import {
  attemptDelivery,
  backoffSeconds,
  signPayload,
  RETRY_DELAYS,
} from './webhook';
import type { WebhookStore } from './store';

const SWEEP_BATCH = 50;

/**
 * Process one batch of due webhook deliveries: re-attempt each and update its
 * row (mark delivered, schedule the next retry, or give up after the max).
 * Returns the number of rows processed. Pure w.r.t. scheduling — all timing
 * comes from the store's `next_retry <= now()` query.
 */
export async function sweepOnce(store: WebhookStore): Promise<number> {
  const due = await store.due(SWEEP_BATCH);
  for (const d of due) {
    const body = JSON.stringify(d.payload);
    const outcome = await attemptDelivery(d.url, body, signPayload(body));
    const attemptsMade = d.attempt + 1;
    const nextRetrySec = outcome.delivered
      ? null
      : backoffSeconds(attemptsMade, config.WEBHOOK_MAX_ATTEMPTS);

    await store.update(d.id, {
      attempt: attemptsMade,
      ...(outcome.statusCode !== undefined
        ? { statusCode: outcome.statusCode }
        : {}),
      delivered: outcome.delivered,
      nextRetrySec,
    });

    if (outcome.delivered) {
      logger.info(
        { sessionId: d.sessionId, attempt: attemptsMade },
        'Webhook delivered on retry'
      );
    } else if (nextRetrySec === null) {
      logger.error(
        { sessionId: d.sessionId, attempt: attemptsMade },
        'Webhook delivery exhausted all retries; giving up'
      );
    }
  }
  return due.length;
}

/**
 * Start the periodic retry sweeper. Returns a stop function that clears the
 * interval. No-op (returns a no-op stopper) when there is no store.
 */
export function startRetryWorker(store: WebhookStore | null): () => void {
  if (!store) {
    return () => undefined;
  }

  logger.info(
    { pollMs: config.WEBHOOK_RETRY_POLL_MS, delays: RETRY_DELAYS },
    'webhook retry worker started'
  );

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return; // avoid overlapping sweeps
    }
    running = true;
    void sweepOnce(store)
      .catch((err) => {
        logger.error({ err }, 'webhook retry sweep failed');
      })
      .finally(() => {
        running = false;
      });
  }, config.WEBHOOK_RETRY_POLL_MS);

  // Don't keep the event loop alive solely for the sweeper.
  timer.unref?.();

  return () => clearInterval(timer);
}
