import { Pool } from 'pg';
import { config, logger } from '../config';
import type { VerificationDecision } from '../types';

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool === undefined) {
    pool = new Pool({ connectionString: config.DATABASE_URL });
  }
  return pool;
}

interface CheckLike {
  checkType?: string;
  provider?: string;
  status?: string;
  score?: number;
}

/**
 * Persist the verification outcome: update the session row and record one
 * verification_checks row per check. Runs in a transaction and first clears any
 * existing check rows for the session, so a Temporal retry is idempotent
 * (no duplicate rows). Rethrows on failure so the write is retried.
 */
export async function saveVerificationResult(input: {
  sessionId: string;
  riskScore: number;
  decision: VerificationDecision;
  checks: Record<string, unknown>;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE verification_sessions
         SET status = 'completed',
             risk_score = $2,
             decision = $3,
             completed_at = now()
       WHERE id = $1`,
      [input.sessionId, input.riskScore, input.decision],
    );

    // Idempotent: replace any prior check rows for this session.
    await client.query(
      `DELETE FROM verification_checks WHERE session_id = $1`,
      [input.sessionId],
    );

    for (const value of Object.values(input.checks)) {
      const check = value as CheckLike;
      if (!check || typeof check !== 'object' || !check.checkType) {
        // Skip non-check entries (e.g. the risk summary, stored on the session).
        continue;
      }
      await client.query(
        `INSERT INTO verification_checks (session_id, check_type, provider, status, score, result_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.sessionId,
          check.checkType,
          check.provider ?? 'unknown',
          check.status ?? 'completed',
          check.score ?? null,
          JSON.stringify(check),
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    logger.error({ err, sessionId: input.sessionId }, 'failed to persist verification result');
    throw err;
  } finally {
    client.release();
  }
}
