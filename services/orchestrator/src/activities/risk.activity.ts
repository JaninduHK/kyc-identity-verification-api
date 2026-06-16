import axios from 'axios';
import { config, logger } from '../config';
import type {
  RiskResult,
  DocumentCheckResult,
  BiometricResult,
  AMLResult,
  IPResult,
} from '../types';

interface RiskResponse {
  score?: number;
  factors?: string[];
}

function defaultResult(): RiskResult {
  return { score: 50, factors: ['scoring_unavailable'] };
}

export async function runRiskScoring(input: {
  sessionId: string;
  document: DocumentCheckResult;
  biometric: BiometricResult;
  aml: AMLResult;
  ip: IPResult;
}): Promise<RiskResult> {
  try {
    const response = await axios.post<RiskResponse>(`${config.RISK_URL}/internal/score`, {
      sessionId: input.sessionId,
      document: input.document,
      biometric: input.biometric,
      aml: input.aml,
      ip: input.ip,
    });
    const data = response.data;
    return {
      score: data.score ?? 50,
      factors: data.factors ?? [],
    };
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId }, 'risk scoring failed');
    return defaultResult();
  }
}
