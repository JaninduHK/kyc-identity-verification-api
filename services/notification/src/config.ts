import pino from 'pino';

export interface AppConfig {
  NOTIFICATION_PORT: number;
  WEBHOOK_SECRET: string;
  SENDGRID_API_KEY: string;
  TWILIO_SID: string;
  TWILIO_TOKEN: string;
  TWILIO_FROM?: string;
  SENDGRID_FROM: string;
  LOG_LEVEL: string;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid port value: ${value}`);
  }
  return parsed;
}

function loadConfig(): AppConfig {
  const WEBHOOK_SECRET =
    process.env.WEBHOOK_SECRET ?? 'replace-with-random-secret';
  if (!WEBHOOK_SECRET) {
    throw new Error('WEBHOOK_SECRET environment variable is required');
  }

  const twilioFrom = process.env.TWILIO_FROM;

  return {
    NOTIFICATION_PORT: parsePort(process.env.NOTIFICATION_PORT, 3003),
    WEBHOOK_SECRET,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ?? '',
    TWILIO_SID: process.env.TWILIO_SID ?? '',
    TWILIO_TOKEN: process.env.TWILIO_TOKEN ?? '',
    TWILIO_FROM: twilioFrom && twilioFrom.length > 0 ? twilioFrom : undefined,
    SENDGRID_FROM: process.env.SENDGRID_FROM ?? 'no-reply@kestrel.lk',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  };
}

export const config: AppConfig = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'notification' },
});
