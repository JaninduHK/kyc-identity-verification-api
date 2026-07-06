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
  status: 'completed' | 'error';
  match: boolean;
  riskLevel: RiskLevel;
  requiresSTR: boolean;
  hits: AMLMatch[];
  searchId?: string;
  strS3Key?: string;
  // Set when a sanction was matched but the STR report/alert could not be
  // produced — the match signal is still returned, this flags follow-up.
  strError?: string;
}
