import { Pool } from 'pg';
import { config, logger } from './config';

/** A webhook delivery that is due for a (re)attempt. */
export interface DueDelivery {
  id: string;
  sessionId: string;
  url: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export interface RecordArgs {
  sessionId: string;
  url: string;
  payload: Record<string, unknown>;
  attempt: number;
  statusCode?: number;
  delivered: boolean;
  /** Seconds until the next retry, or null when no further retry is scheduled. */
  nextRetrySec: number | null;
}

export interface UpdateArgs {
  attempt: number;
  statusCode?: number;
  delivered: boolean;
  nextRetrySec: number | null;
}

/**
 * Persistence for webhook delivery attempts, backed by the webhook_deliveries
 * table. Abstracted behind an interface so the delivery/retry logic can be
 * unit-tested against an in-memory fake without a live database.
 */
export interface WebhookStore {
  record(args: RecordArgs): Promise<string>;
  due(limit: number): Promise<DueDelivery[]>;
  update(id: string, args: UpdateArgs): Promise<void>;
  close(): Promise<void>;
}

class PgWebhookStore implements WebhookStore {
  constructor(private readonly pool: Pool) {}

  async record(args: RecordArgs): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO webhook_deliveries
         (session_id, url, payload, status_code, attempt, delivered, next_retry)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6,
               CASE WHEN $7::int IS NULL THEN NULL ELSE now() + make_interval(secs => $7) END)
       RETURNING id`,
      [
        args.sessionId,
        args.url,
        JSON.stringify(args.payload),
        args.statusCode ?? null,
        args.attempt,
        args.delivered,
        args.nextRetrySec,
      ]
    );
    return rows[0].id;
  }

  async due(limit: number): Promise<DueDelivery[]> {
    const { rows } = await this.pool.query<{
      id: string;
      session_id: string;
      url: string;
      payload: Record<string, unknown>;
      attempt: number;
    }>(
      `SELECT id, session_id, url, payload, attempt
         FROM webhook_deliveries
        WHERE delivered = false
          AND next_retry IS NOT NULL
          AND next_retry <= now()
        ORDER BY next_retry ASC
        LIMIT $1`,
      [limit]
    );
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      url: r.url,
      payload: r.payload,
      attempt: r.attempt,
    }));
  }

  async update(id: string, args: UpdateArgs): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_deliveries
          SET attempt = $2,
              status_code = $3,
              delivered = $4,
              next_retry = CASE WHEN $5::int IS NULL THEN NULL
                                ELSE now() + make_interval(secs => $5) END
        WHERE id = $1`,
      [id, args.attempt, args.statusCode ?? null, args.delivered, args.nextRetrySec]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Builds a Postgres-backed store when DATABASE_URL is configured, otherwise
 * returns null so the service runs statelessly (deliver once, no durable
 * retry) — useful for minimal/local setups without a database.
 */
export function createStore(): WebhookStore | null {
  if (!config.DATABASE_URL) {
    logger.warn(
      'DATABASE_URL not set; webhook delivery runs without durable retry'
    );
    return null;
  }
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  pool.on('error', (err) => {
    logger.error({ err }, 'webhook store pool error');
  });
  return new PgWebhookStore(pool);
}
