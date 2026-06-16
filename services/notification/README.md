# Notification Service

Webhook delivery, email, and SMS notification service for the Kestrel KYC
platform.

## Overview

- Delivers signed webhooks (HMAC-SHA256 over the JSON body) with exponential
  retry scheduling.
- Sends transactional email via SendGrid.
- Sends SMS via Twilio.

Runs on port **3003**.

## Endpoints

| Method | Path                        | Description                       |
| ------ | --------------------------- | --------------------------------- |
| GET    | `/health`                   | Liveness check.                   |
| GET    | `/ready`                    | Readiness check (always ready).   |
| POST   | `/internal/webhook/deliver` | Deliver a webhook.                |
| POST   | `/internal/email/send`      | Send an email.                    |
| POST   | `/internal/sms/send`        | Send an SMS.                      |

### Webhook signing

Each webhook request includes the header:

```
X-Kestrel-Signature: sha256=<hmac>
```

The HMAC is computed over the raw JSON body using `WEBHOOK_SECRET`. Failed
deliveries return a `nextRetry` delay (seconds) from the retry schedule
`[30, 120, 600, 3600, 86400]`.

## Configuration

| Variable            | Default                  | Required |
| ------------------- | ------------------------ | -------- |
| `NOTIFICATION_PORT` | `3003`                   | No       |
| `WEBHOOK_SECRET`    | `replace-with-random-secret` | No   |
| `SENDGRID_API_KEY`  |                          | No       |
| `TWILIO_SID`        |                          | No       |
| `TWILIO_TOKEN`      |                          | No       |
| `TWILIO_FROM`       |                          | No       |
| `SENDGRID_FROM`     | `no-reply@kestrel.lk`    | No       |
| `LOG_LEVEL`         | `info`                   | No       |

## Development

```bash
npm install
npm run dev      # ts-node src/server.ts
npm run build    # tsc
npm start        # node dist/server.js
```
