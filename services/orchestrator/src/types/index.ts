export interface CDDInput {
  sessionId: string;
  clientId: string;
  nicImageBase64: string;
  selfieBase64?: string;
  name?: string;
  dob?: string;
  country: string;
  ipAddress?: string;
  webhookUrl?: string;
}

export interface CheckResult {
  checkType: string;
  provider: string;
  status: string;
  score?: number;
}

export interface DocumentCheckResult extends CheckResult {
  result: string;
  subResult?: string;
  extractedName?: string;
  extractedDob?: string;
  extractedNic?: string;
  documentType?: string;
  confidence: number;
  applicantId?: string;
  documentId?: string;
}

export interface BiometricResult extends CheckResult {
  result: string;
  faceMatch: boolean;
  similarityScore: number;
  livenessPassed: boolean;
}

export type AMLRiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface AMLHit {
  name: string;
  matchTypes: string[];
  sourceUrl?: string;
}

export interface AMLResult extends CheckResult {
  match: boolean;
  riskLevel: AMLRiskLevel;
  requiresSTR: boolean;
  hits: AMLHit[];
  strS3Key?: string;
}

export interface IPResult extends CheckResult {
  ipRiskScore: number;
  isVpn: boolean;
  isProxy: boolean;
  country?: string;
}

export interface RiskResult {
  score: number;
  factors: string[];
}

export type VerificationDecision = 'approved' | 'manual_review' | 'rejected';

export type WorkflowType = 'cdd' | 'edd';

export interface VerificationResult {
  sessionId: string;
  decision: VerificationDecision;
  riskScore: number;
}

export interface AllChecks {
  document: DocumentCheckResult;
  biometric: BiometricResult;
  aml: AMLResult;
  ip: IPResult;
  risk: RiskResult;
}
