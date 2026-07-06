import axios from 'axios';
import { config, logger } from '../config';
import type { IPResult } from '../types';

interface IPResponse {
  status?: string;
  score?: number;
  ipRiskScore?: number;
  isVpn?: boolean;
  isProxy?: boolean;
  country?: string;
}

/**
 * Calls the IP risk endpoint. Throws on transport/5xx so Temporal retries; the
 * workflow degrades to a default IP result only after retries are exhausted.
 */
export async function runIPRiskCheck(input: {
  sessionId: string;
  ipAddress?: string;
}): Promise<IPResult> {
  try {
    const response = await axios.post<IPResponse>(`${config.IP_RISK_URL}/internal/ip`, {
      sessionId: input.sessionId,
      ipAddress: input.ipAddress,
    });
    const data = response.data;
    return {
      checkType: 'ip',
      provider: 'internal',
      status: data.status ?? 'completed',
      score: data.score,
      ipRiskScore: data.ipRiskScore ?? 0,
      isVpn: data.isVpn ?? false,
      isProxy: data.isProxy ?? false,
      country: data.country,
    };
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId }, 'ip risk check failed');
    throw err;
  }
}
