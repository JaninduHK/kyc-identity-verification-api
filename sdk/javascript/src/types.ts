export interface KestrelConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface VerifyIndividualParams {
  nicImageBase64: string;
  selfieBase64?: string;
  workflowType?: 'cdd' | 'edd';
  country?: string;
  webhookUrl?: string;
}

export interface VerifyBusinessParams {
  registrationNumber: string;
  companyName: string;
  country?: string;
  webhookUrl?: string;
}

export interface VerifyResponse {
  sessionId: string;
  status: string;
  riskScore?: number;
  decision?: string;
  token?: string;
  createdAt?: string;
}

export interface SessionListParams {
  limit?: number;
  offset?: number;
}

export interface SessionListResponse {
  sessions: VerifyResponse[];
  limit: number;
  offset: number;
}

export interface AMLScreenParams {
  name: string;
  dob?: string;
  country: string;
}

export interface AMLHit {
  name: string;
  matchTypes: string[];
  sourceUrl?: string;
}

export interface AMLResult {
  match: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  requiresSTR: boolean;
  hits: AMLHit[];
}
