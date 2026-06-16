import axios from 'axios';
import { config, logger } from '../config';
import type { CDDInput, BiometricResult } from '../types';

interface BiometricResponse {
  status?: string;
  result?: string;
  score?: number;
  faceMatch?: boolean;
  similarityScore?: number;
  livenessPassed?: boolean;
}

function defaultResult(): BiometricResult {
  return {
    checkType: 'biometric',
    provider: 'onfido',
    status: 'error',
    result: 'error',
    faceMatch: false,
    similarityScore: 0,
    livenessPassed: false,
  };
}

export async function runOnfidoBiometric(
  input: CDDInput & { applicantId?: string; documentId?: string },
): Promise<BiometricResult> {
  try {
    const response = await axios.post<BiometricResponse>(
      `${config.BIOMETRIC_URL}/internal/check`,
      {
        sessionId: input.sessionId,
        selfieBase64: input.selfieBase64,
        applicantId: input.applicantId,
        documentId: input.documentId,
      },
    );
    const data = response.data;
    return {
      checkType: 'biometric',
      provider: 'onfido',
      status: data.status ?? 'completed',
      result: data.result ?? 'clear',
      score: data.score,
      faceMatch: data.faceMatch ?? false,
      similarityScore: data.similarityScore ?? 0,
      livenessPassed: data.livenessPassed ?? false,
    };
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId }, 'biometric check failed');
    return defaultResult();
  }
}
