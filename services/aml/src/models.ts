export interface AMLScreenRequest {
  name: string;
  dob?: string;
  country: string;
  sessionId: string;
}

export interface AMLMatch {
  name: string;
  matchTypes: string[];
  sourceUrl?: string;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface AMLScreenResult {
  match: boolean;
  riskLevel: RiskLevel;
  requiresSTR: boolean;
  hits: AMLMatch[];
  strS3Key?: string;
}
