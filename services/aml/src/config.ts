import pino from 'pino';

export interface AppConfig {
  AML_PORT: number;
  COMPLY_ADVANTAGE_KEY: string;
  COMPLY_ADVANTAGE_URL: string;
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_KMS_KEY_ID?: string;
  COMPLIANCE_EMAIL: string;
  NOTIFICATION_URL: string;
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
  const COMPLIANCE_EMAIL = process.env.COMPLIANCE_EMAIL ?? '';
  if (!COMPLIANCE_EMAIL) {
    throw new Error('COMPLIANCE_EMAIL environment variable is required');
  }

  const kmsKeyId = process.env.AWS_KMS_KEY_ID;

  return {
    AML_PORT: parsePort(process.env.AML_PORT, 3002),
    COMPLY_ADVANTAGE_KEY: process.env.COMPLY_ADVANTAGE_KEY ?? '',
    COMPLY_ADVANTAGE_URL:
      process.env.COMPLY_ADVANTAGE_URL ?? 'https://api.complyadvantage.com',
    AWS_REGION: process.env.AWS_REGION ?? 'ap-south-1',
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET ?? 'kestrel-kyc-documents',
    AWS_KMS_KEY_ID: kmsKeyId && kmsKeyId.length > 0 ? kmsKeyId : undefined,
    COMPLIANCE_EMAIL,
    NOTIFICATION_URL: process.env.NOTIFICATION_URL ?? 'http://notification:3003',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  };
}

export const config: AppConfig = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'aml' },
});
