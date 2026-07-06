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

The HMAC is computed over the raw JSON body using `WEBHOOK_SECRET` (which is
**required** — the service refuses to start without it).

### Durable retries

Webhook deliveries are persisted to the `webhook_deliveries` table. On failure
the row is scheduled for retry using the backoff schedule
`[30, 120, 600, 3600, 86400]` seconds (up to `WEBHOOK_MAX_ATTEMPTS`). A
background worker polls every `WEBHOOK_RETRY_POLL_MS` for due rows, re-attempts
delivery, and marks each row delivered or exhausted. Retries therefore survive
process restarts. When `DATABASE_URL` is not set the service still delivers
webhooks but without durable retry (a warning is logged).

### Request validation

All `/internal/*` routes validate their JSON body via a schema; malformed
payloads get `400` before any provider/DB call. SMS sends are skipped (with a
warning) when Twilio credentials or `TWILIO_FROM` are missing, rather than
throwing an opaque provider error.

## Configuration

| Variable                | Default               | Required |
| ----------------------- | --------------------- | -------- |
| `NOTIFICATION_PORT`     | `3003`                | No       |
| `WEBHOOK_SECRET`        |                       | **Yes**  |
| `DATABASE_URL`          |                       | No (enables durable retry) |
| `WEBHOOK_MAX_ATTEMPTS`  | `5`                   | No       |
| `WEBHOOK_RETRY_POLL_MS` | `60000`               | No       |
| `SENDGRID_API_KEY`      |                       | No       |
| `TWILIO_SID`            |                       | No       |
| `TWILIO_TOKEN`          |                       | No       |
| `TWILIO_FROM`           |                       | No       |
| `SENDGRID_FROM`         | `no-reply@kestrel.lk` | No       |
| `LOG_LEVEL`             | `info`                | No       |

## Development

```bash
npm install
npm run dev      # ts-node src/server.ts
npm run build    # tsc
npm start        # node dist/server.js
```
