import axios from 'axios';
import { config, logger } from '../config';

export async function createAuditEvent(input: {
  sessionId: string;
  clientId?: string;
  eventType: string;
  actor?: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    await axios.post(`${config.AUDIT_URL}/internal/events`, {
      sessionId: input.sessionId,
      clientId: input.clientId,
      eventType: input.eventType,
      actor: input.actor ?? 'orchestrator',
      data: input.data,
    });
  } catch (err) {
    logger.error({ err, sessionId: input.sessionId, eventType: input.eventType }, 'audit event failed');
  }
}
