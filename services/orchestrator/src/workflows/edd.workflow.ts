import type { CDDInput, VerificationResult } from '../types';
import { runAllChecks, finalize } from './pipeline';
import { eddDecision } from './decision';

export async function eddWorkflow(input: CDDInput): Promise<VerificationResult> {
  const checks = await runAllChecks(input);
  // Enhanced Due Diligence: stricter than CDD — escalates on AML signals and
  // any non-clean biometric, and approves straight-through only for very low
  // risk (see eddDecision).
  const decision = eddDecision(checks.risk.score, {
    aml: checks.aml,
    biometric: checks.biometric,
  });
  await finalize(input, checks, decision, 'edd');
  return { sessionId: input.sessionId, decision, riskScore: checks.risk.score };
}
