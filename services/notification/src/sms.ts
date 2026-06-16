import twilio from 'twilio';
import { config, logger } from './config';
import type { SMSRequest } from './models';

export interface SMSResult {
  sent: boolean;
}

export async function sendSMS(req: SMSRequest): Promise<SMSResult> {
  try {
    if (!config.TWILIO_SID || !config.TWILIO_TOKEN) {
      logger.warn(
        { to: req.to },
        'Twilio credentials not set; SMS skipped'
      );
      return { sent: false };
    }

    const client = twilio(config.TWILIO_SID, config.TWILIO_TOKEN);
    await client.messages.create({
      to: req.to,
      from: config.TWILIO_FROM,
      body: req.message,
    });

    logger.info({ to: req.to }, 'SMS sent');
    return { sent: true };
  } catch (err) {
    logger.error({ err, to: req.to }, 'Failed to send SMS');
    return { sent: false };
  }
}
