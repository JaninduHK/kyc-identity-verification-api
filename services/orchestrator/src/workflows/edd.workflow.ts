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
  VerificationResult,
} from '../types';

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

const defaultDocument: DocumentCheckResult = {
  checkType: 'document',
  provider: 'onfido',
  status: 'error',
  result: 'error',
  confidence: 0,
};

const defaultBiometric: BiometricResult = {
  checkType: 'biometric',
  provider: 'onfido',
  status: 'error',
  result: 'error',
  faceMatch: false,
  similarityScore: 0,
  livenessPassed: false,
};

const defaultAml: AMLResult = {
  checkType: 'aml',
  provider: 'internal',
  status: 'error',
  match: false,
  riskLevel: 'none',
  requiresSTR: false,
  hits: [],
};

const defaultIp: IPResult = {
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

function baseDecision(score: number): VerificationDecision {
  if (score < 30) {
    return 'approved';
  }
  if (score <= 70) {
    return 'manual_review';
  }
  return 'rejected';
}

export async function eddWorkflow(input: CDDInput): Promise<VerificationResult> {
  const [documentSettled, biometricSettled, amlSettled, ipSettled] = await Promise.allSettled([
    runOnfidoDocumentCheck(input),
    runOnfidoBiometric(input),
    runAMLScreening({
      name: input.name,
      dob: input.dob,
      country: input.country,
      sessionId: input.sessionId,
    }),
    runIPRiskCheck({ sessionId: input.sessionId, ipAddress: input.ipAddress }),
  ]);

  const document = settledOr(documentSettled, defaultDocument);
  const biometric = settledOr(biometricSettled, defaultBiometric);
  const aml = settledOr(amlSettled, defaultAml);
  const ip = settledOr(ipSettled, defaultIp);

  const risk: RiskResult = await runRiskScoring({
    sessionId: input.sessionId,
    document,
    biometric,
    aml,
    ip,
  });

  const initialDecision = baseDecision(risk.score);
  // EDD forces a human in the loop unless the case is an outright rejection.
  const decision: VerificationDecision =
    initialDecision === 'rejected' ? 'rejected' : 'manual_review';

  const checks: Record<string, unknown> = { document, biometric, aml, ip, risk };

  await createAuditEvent({
    sessionId: input.sessionId,
    clientId: input.clientId,
    eventType: 'EDD_MANUAL_REVIEW_REQUIRED',
    actor: 'orchestrator',
    data: { decision, riskScore: risk.score, workflowType: 'edd' },
  });

  await saveVerificationResult({
    sessionId: input.sessionId,
    riskScore: risk.score,
    decision,
    checks,
  });

  await createAuditEvent({
    sessionId: input.sessionId,
    clientId: input.clientId,
    eventType: 'VERIFICATION_COMPLETED',
    actor: 'orchestrator',
    data: { decision, riskScore: risk.score, workflowType: 'edd' },
  });

  if (input.webhookUrl !== undefined && input.webhookUrl !== '') {
    await fireWebhook({
      sessionId: input.sessionId,
      url: input.webhookUrl,
      payload: { sessionId: input.sessionId, decision, riskScore: risk.score },
    });
  }

  return { sessionId: input.sessionId, decision, riskScore: risk.score };
}
