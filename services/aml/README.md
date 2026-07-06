# AML Service

AML (Anti-Money Laundering) screening and Suspicious Transaction Report (STR)
generation service for the Kestrel KYC platform.

## Overview

- Screens individuals against ComplyAdvantage (sanctions, PEP, warning,
  adverse-media lists).
- Computes a risk level and determines whether an STR is required.
- Generates STR PDF reports and stores them encrypted in S3.
- Alerts the compliance officer via the notification service when a sanction
  match is detected.

Runs on port **3002**.

## Endpoints

| Method | Path               | Description                          |
| ------ | ------------------ | ------------------------------------ |
| GET    | `/health`          | Liveness check.                      |
| GET    | `/ready`           | Readiness check (always ready).      |
| POST   | `/internal/screen` | Screen an individual (`AMLScreenRequest`). |

### POST /internal/screen

Request body:

```json
{
  "name": "John Doe",
  "dob": "1980-01-01",
  "country": "LK",
  "sessionId": "session-123"
}
```

`name`, `country` and `sessionId` are required and validated by a JSON schema;
a malformed body returns `400` before any provider call is made.

Response (`AMLScreenResult`):

```json
{
  "status": "completed",
  "match": true,
  "riskLevel": "high",
  "requiresSTR": true,
  "hits": [{ "name": "John Doe", "matchTypes": ["sanction"] }],
  "searchId": "12345",
  "strS3Key": "str-reports/session-123/STR-2026-06-08T00-00-00-000Z.pdf"
}
```

## Behaviour notes

- **Fail closed.** If the ComplyAdvantage call fails, the service returns
  `502` and throws rather than fabricating a clean pass — a screening that could
  not run must never look like "no match" on a compliance path.
- **STR resilience.** A sanction match is always returned even if STR
  generation or the compliance alert fails; the failure is surfaced in
  `strError` (and logged) instead of discarding the match.
- **Auth.** The ComplyAdvantage key is sent via the `Authorization: Token …`
  header, never as a query parameter (which would leak it into logs).
- **Ongoing monitoring.** Searches are created with `is_monitored: true`, so
  ComplyAdvantage re-screens flagged subjects as watchlists change.

## Risk Levels

- `high` — any sanction match (requires STR).
- `medium` — PEP or warning match.
- `low` — adverse-media match only.
- `none` — no matches.

## Configuration

| Variable               | Default                          | Required |
| ---------------------- | -------------------------------- | -------- |
| `AML_PORT`             | `3002`                           | No       |
| `COMPLY_ADVANTAGE_KEY` |                                  | No       |
| `COMPLY_ADVANTAGE_URL` | `https://api.complyadvantage.com`| No       |
| `AWS_REGION`           | `ap-south-1`                     | No       |
| `AWS_S3_BUCKET`        | `kestrel-kyc-documents`          | No       |
| `AWS_KMS_KEY_ID`       |                                  | No       |
| `COMPLIANCE_EMAIL`     |                                  | **Yes**  |
| `NOTIFICATION_URL`     | `http://notification:3003`       | No       |
| `LOG_LEVEL`            | `info`                           | No       |

## Development

```bash
npm install
npm run dev      # ts-node src/server.ts
npm run build    # tsc
npm start        # node dist/server.js
```
