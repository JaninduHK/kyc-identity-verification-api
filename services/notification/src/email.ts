import sgMail from '@sendgrid/mail';
import { config, logger } from './config';
import type { EmailRequest } from './models';

export interface EmailResult {
  sent: boolean;
}

export async function sendEmail(req: EmailRequest): Promise<EmailResult> {
  try {
    if (!config.SENDGRID_API_KEY) {
      logger.warn({ to: req.to }, 'SENDGRID_API_KEY not set; email skipped');
      return { sent: false };
    }

    sgMail.setApiKey(config.SENDGRID_API_KEY);
    await sgMail.send({
      to: req.to,
      from: config.SENDGRID_FROM,
      subject: req.subject,
      text: req.body,
      ...(req.html ? { html: req.html } : {}),
    });

    logger.info({ to: req.to }, 'Email sent');
    return { sent: true };
  } catch (err) {
    logger.error({ err, to: req.to }, 'Failed to send email');
    return { sent: false };
  }
}
