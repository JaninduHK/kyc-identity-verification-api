import axios from 'axios';
import { config, logger } from './config';

export async function scheduleRescreening(clientId: string): Promise<void> {
  logger.info({ clientId }, 'ongoing monitoring scheduled');
}

export interface ComplianceAlertData {
  sessionId: string;
  subjectName: string;
  s3Key: string;
}

export async function alertComplianceOfficer(
  data: ComplianceAlertData
): Promise<void> {
  try {
    await axios.post(`${config.NOTIFICATION_URL}/internal/email/send`, {
      to: config.COMPLIANCE_EMAIL,
      subject: `STR Alert - ${data.sessionId}`,
      body:
        `A sanction match was detected during AML screening.\n\n` +
        `Subject: ${data.subjectName}\n` +
        `Session ID: ${data.sessionId}\n` +
        `STR Report S3 Key: ${data.s3Key}\n\n` +
        `Please review the suspicious transaction report.`,
    });
    logger.info(
      { sessionId: data.sessionId },
      'Compliance officer alerted'
    );
  } catch (err) {
    logger.error(
      { err, sessionId: data.sessionId },
      'Failed to alert compliance officer'
    );
  }
}
