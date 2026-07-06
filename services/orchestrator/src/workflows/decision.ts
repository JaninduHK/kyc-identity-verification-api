import type {
  AMLResult,
  BiometricResult,
  CDDInput,
  DocumentCheckResult,
  VerificationDecision,
} from '../types';

/**
 * CDD decision from the aggregate risk score.
 *   < 30  → approved
 *   30–70 → manual_review
 *   > 70  → rejected
 */
export function baseDecision(score: number): VerificationDecision {
  if (score < 30) {
    return 'approved';
  }
  if (score <= 70) {
    return 'manual_review';
  }
  return 'rejected';
}

/**
 * EDD (Enhanced Due Diligence) decision: materially stricter than CDD. On top
 * of the base score bands it escalates on AML signals and biometric outcomes,
 * and applies a much lower bar for straight-through approval.
 */
export function eddDecision(
  score: number,
  checks: { aml: AMLResult; biometric: BiometricResult },
): VerificationDecision {
  if (baseDecision(score) === 'rejected') {
    return 'rejected';
  }

  const { aml, biometric } = checks;

  // Any sanction hit / STR requirement is an outright rejection under EDD.
  if (aml.riskLevel === 'high' || aml.requiresSTR) {
    return 'rejected';
  }
  // Any other AML match needs a human.
  if (aml.match) {
    return 'manual_review';
  }
  // Biometric must be a clean, live match — anything else escalates.
  if (biometric.result !== 'clear' || !biometric.livenessPassed) {
    return 'manual_review';
  }
  // Stricter straight-through-approval bar than CDD (15 vs 30).
  if (score >= 15) {
    return 'manual_review';
  }
  return 'approved';
}

/**
 * The biometric check can only run when a selfie was supplied AND the document
 * check produced the Onfido applicant/document IDs it must reference.
 */
export function shouldRunBiometric(
  input: Pick<CDDInput, 'selfieBase64'>,
  document: Pick<DocumentCheckResult, 'applicantId' | 'documentId'>,
): boolean {
  return Boolean(
    input.selfieBase64 && document.applicantId && document.documentId,
  );
}
