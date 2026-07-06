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

/**
 * Calls the biometric service with the selfie and the Onfido applicant/document
 * IDs produced by the document check. Throws on transport/5xx so Temporal
 * retries; logical failures return in the 200 body.
 */
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
    throw err;
  }
}
