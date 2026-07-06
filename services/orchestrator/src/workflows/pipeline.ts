import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import type {
  CDDInput,
  DocumentCheckResult,
  BiometricResult,
  AMLResult,
  IPResult,
  RiskResult,
  VerificationDecision,
  WorkflowType,
} from '../types';
import { shouldRunBiometric } from './decision';

const {
  runOnfidoDocumentCheck,
  runOnfidoBiometric,
  runAMLScreening,
  runIPRiskCheck,
  runRiskScoring,
  saveVerificationResult,
  createAuditEvent,
  fireWebhook,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '60s',
  retry: { maximumAttempts: 3 },
});

// Fallbacks used when a check ultimately fails (after Temporal retries). A
// failed check degrades to an "error" result the risk engine can score, rather
// than failing the whole verification.
export const defaultDocument: DocumentCheckResult = {
  checkType: 'document',
  provider: 'onfido',
  status: 'error',
  result: 'error',
  confidence: 0,
};

export const defaultBiometric: BiometricResult = {
  checkType: 'biometric',
  provider: 'onfido',
  status: 'error',
  result: 'error',
  faceMatch: false,
  similarityScore: 0,
  livenessPassed: false,
};

// Distinct from a failure: biometric was legitimately not run (no selfie, or
// document produced no applicant/document IDs). Not penalised by the scorer.
const skippedBiometric: BiometricResult = {
  checkType: 'biometric',
  provider: 'onfido',
  status: 'skipped',
  result: 'skipped',
  faceMatch: false,
  similarityScore: 0,
  livenessPassed: false,
};

export const defaultAml: AMLResult = {
  checkType: 'aml',
  provider: 'internal',
  status: 'error',
  match: false,
  riskLevel: 'none',
  requiresSTR: false,
  hits: [],
};

export const defaultIp: IPResult = {
  checkType: 'ip',
  provider: 'internal',
  status: 'error',
  ipRiskScore: 0,
  isVpn: false,
  isProxy: false,
};

function settledOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export interface Checks {
  document: DocumentCheckResult;
  biometric: BiometricResult;
  aml: AMLResult;
  ip: IPResult;
  risk: RiskResult;
}

/**
 * Run all specialist checks. Document and biometric run as a sequential chain
 * (biometric needs the applicant/document IDs the document check produces),
 * while AML and IP run concurrently alongside them. Risk scoring runs last over
 * the aggregated results.
 */
export async function runAllChecks(input: CDDInput): Promise<Checks> {
  const documentThenBiometric = async (): Promise<{
    document: DocumentCheckResult;
    biometric: BiometricResult;
  }> => {
    const document = await runOnfidoDocumentCheck(input);
    let biometric: BiometricResult;
    if (shouldRunBiometric(input, document)) {
      biometric = await runOnfidoBiometric({
        ...input,
        applicantId: document.applicantId,
        documentId: document.documentId,
      });
    } else {
      biometric = skippedBiometric;
    }
    return { document, biometric };
  };

  const [docBioSettled, amlSettled, ipSettled] = await Promise.allSettled([
    documentThenBiometric(),
    runAMLScreening({
      name: input.name,
      dob: input.dob,
      country: input.country,
      sessionId: input.sessionId,
    }),
    runIPRiskCheck({ sessionId: input.sessionId, ipAddress: input.ipAddress }),
  ]);

  const { document, biometric } = settledOr(docBioSettled, {
    document: defaultDocument,
    biometric: defaultBiometric,
  });
  const aml = settledOr(amlSettled, defaultAml);
  const ip = settledOr(ipSettled, defaultIp);

  let risk: RiskResult;
  try {
    risk = await runRiskScoring({
      sessionId: input.sessionId,
      document,
      biometric,
      aml,
      ip,
    });
  } catch {
    // Risk scoring is retried by Temporal; if it still fails, fall back to a
    // neutral score so the verification completes and lands in manual review.
    risk = { score: 50, factors: ['scoring_unavailable'] };
  }

  return { document, biometric, aml, ip, risk };
}

/**
 * Persist the result, write the audit trail, and fire the webhook. Persistence
 * and audit are essential (retried; failure fails the workflow visibly); the
 * webhook is best-effort here because the notification service performs its own
 * durable retries.
 */
export async function finalize(
  input: CDDInput,
  checks: Checks,
  decision: VerificationDecision,
  workflowType: WorkflowType,
): Promise<void> {
  if (workflowType === 'edd' && decision === 'manual_review') {
    await createAuditEvent({
      sessionId: input.sessionId,
      clientId: input.clientId,
      eventType: 'EDD_MANUAL_REVIEW_REQUIRED',
      actor: 'orchestrator',
      data: { decision, riskScore: checks.risk.score, workflowType },
    });
  }

  await saveVerificationResult({
    sessionId: input.sessionId,
    riskScore: checks.risk.score,
    decision,
    checks: {
      document: checks.document,
      biometric: checks.biometric,
      aml: checks.aml,
      ip: checks.ip,
      risk: checks.risk,
    },
  });

  await createAuditEvent({
    sessionId: input.sessionId,
    clientId: input.clientId,
    eventType: 'VERIFICATION_COMPLETED',
    actor: 'orchestrator',
    data: { decision, riskScore: checks.risk.score, workflowType },
  });

  if (input.webhookUrl !== undefined && input.webhookUrl !== '') {
    try {
      await fireWebhook({
        sessionId: input.sessionId,
        url: input.webhookUrl,
        payload: {
          sessionId: input.sessionId,
          decision,
          riskScore: checks.risk.score,
        },
      });
    } catch {
      // Best-effort: the notification service retries delivery durably.
    }
  }
}
