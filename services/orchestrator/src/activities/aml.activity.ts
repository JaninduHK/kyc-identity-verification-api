import axios from 'axios';
import { config, logger } from '../config';
import type { AMLResult, AMLHit, AMLRiskLevel } from '../types';

interface AMLResponse {
  status?: string;
  score?: number;
  match?: boolean;
  riskLevel?: AMLRiskLevel;
  requiresSTR?: boolean;
  hits?: AMLHit[];
  strS3Key?: string;
}

/**
 * Calls the AML service. It fails closed (502 on provider error), so a thrown
 * error here is retried by Temporal rather than being treated as a clean pass.
 */
export async function runAMLScreening(input: {
  name?: string;
  dob?: string;
  country: string;
  sessionId: string;
}): Promise<AMLResult> {
  try {
    const response = await axios.post<AMLResponse>(`${config.AML_URL}/internal/screen`, {
      name: input.name,
      dob: input.dob,
      country: input.country,
      sessionId: input.sessionId,
    });
    const data = response.data;
    return {
      checkType: 'aml',
      provider: 'internal',
      status: data.status ?? 'completed',
      score: data.score,
      match: data.match ?? false,
      riskLevel: data.riskLevel ?? 'none',
      requiresSTR: data.requiresSTR ?? false,
      hits: data.hits ?? [],
      strS3Key: data.strS3Key,
    };
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId }, 'aml screening failed');
    throw err;
  }
}
