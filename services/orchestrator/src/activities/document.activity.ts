import axios from 'axios';
import { config, logger } from '../config';
import type { CDDInput, DocumentCheckResult } from '../types';

interface DocumentCheckResponse {
  status?: string;
  result?: string;
  subResult?: string;
  score?: number;
  extractedName?: string;
  extractedDob?: string;
  extractedNic?: string;
  documentType?: string;
  confidence?: number;
  applicantId?: string;
  documentId?: string;
}

/**
 * Calls the document service. Throws on transport/5xx failures so Temporal
 * retries; logical failures come back as a 200 body with status="error" and
 * are returned as-is for the risk engine to score.
 */
export async function runOnfidoDocumentCheck(input: CDDInput): Promise<DocumentCheckResult> {
  try {
    const response = await axios.post<DocumentCheckResponse>(
      `${config.DOCUMENT_URL}/internal/check`,
      { nicImageBase64: input.nicImageBase64, sessionId: input.sessionId },
    );
    const data = response.data;
    return {
      checkType: 'document',
      provider: 'onfido',
      status: data.status ?? 'completed',
      result: data.result ?? 'clear',
      subResult: data.subResult,
      score: data.score,
      extractedName: data.extractedName,
      extractedDob: data.extractedDob,
      extractedNic: data.extractedNic,
      documentType: data.documentType,
      confidence: data.confidence ?? 0,
      applicantId: data.applicantId,
      documentId: data.documentId,
    };
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId }, 'document check failed');
    throw err;
  }
}
