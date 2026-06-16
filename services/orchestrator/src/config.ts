import pino from 'pino';

export const logger = pino({
  name: 'orchestrator',
  level: process.env.LOG_LEVEL ?? 'info',
});

export interface Config {
  ORCHESTRATOR_PORT: number;
  TEMPORAL_ADDRESS: string;
  TEMPORAL_NAMESPACE: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  RABBITMQ_URL: string;
  DOCUMENT_URL: string;
  BIOMETRIC_URL: string;
  AML_URL: string;
  RISK_URL: string;
  AUDIT_URL: string;
  NOTIFICATION_URL: string;
  IP_RISK_URL: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value;
}

function loadConfig(): Config {
  const portRaw = optionalEnv('ORCHESTRATOR_PORT', '3001');
  const port = Number.parseInt(portRaw, 10);
  if (Number.isNaN(port)) {
    throw new Error(`Invalid ORCHESTRATOR_PORT: ${portRaw}`);
  }

  const riskUrl = optionalEnv('RISK_URL', 'http://risk:8003');

  return {
    ORCHESTRATOR_PORT: port,
    TEMPORAL_ADDRESS: optionalEnv('TEMPORAL_ADDRESS', 'localhost:7233'),
    TEMPORAL_NAMESPACE: optionalEnv('TEMPORAL_NAMESPACE', 'kestrel-kyc'),
    DATABASE_URL: requireEnv('DATABASE_URL'),
    REDIS_URL: requireEnv('REDIS_URL'),
    RABBITMQ_URL: requireEnv('RABBITMQ_URL'),
    DOCUMENT_URL: optionalEnv('DOCUMENT_URL', 'http://document:8001'),
    BIOMETRIC_URL: optionalEnv('BIOMETRIC_URL', 'http://biometric:8002'),
    AML_URL: optionalEnv('AML_URL', 'http://aml:3002'),
    RISK_URL: riskUrl,
    AUDIT_URL: optionalEnv('AUDIT_URL', 'http://audit:8004'),
    NOTIFICATION_URL: optionalEnv('NOTIFICATION_URL', 'http://notification:3003'),
    IP_RISK_URL: optionalEnv('IP_RISK_URL', riskUrl),
  };
}

export const config: Config = loadConfig();
