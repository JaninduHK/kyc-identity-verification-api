import type { CDDInput, VerificationResult } from '../types';
import { runAllChecks, finalize } from './pipeline';
import { baseDecision } from './decision';

export async function cddWorkflow(input: CDDInput): Promise<VerificationResult> {
  const checks = await runAllChecks(input);
  const decision = baseDecision(checks.risk.score);
  await finalize(input, checks, decision, 'cdd');
  return { sessionId: input.sessionId, decision, riskScore: checks.risk.score };
}
