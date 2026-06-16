export interface WebhookDelivery {
  sessionId: string;
  url: string;
  payload: Record<string, unknown>;
  attempt?: number;
}

export interface EmailRequest {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface SMSRequest {
  to: string;
  message: string;
}
