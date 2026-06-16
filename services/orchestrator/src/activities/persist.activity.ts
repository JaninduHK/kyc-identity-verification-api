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

export async function saveVerificationResult(input: {
  sessionId: string;
  riskScore: number;
  decision: VerificationDecision;
  checks: Record<string, unknown>;
}): Promise<void> {
  try {
    await getPool().query(
      `UPDATE verification_sessions
         SET status = 'completed',
             risk_score = $2,
             decision = $3,
             checks = $4,
             completed_at = now()
       WHERE id = $1`,
      [input.sessionId, input.riskScore, input.decision, JSON.stringify(input.checks)],
    );
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId }, 'failed to persist verification result');
  }
}
