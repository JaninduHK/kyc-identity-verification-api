# Kestrel Document Service

FastAPI microservice for KYC document verification on the Kestrel platform.
It verifies Sri Lankan National Identity Cards (NIC) via Onfido, with an
on-device Tesseract OCR fallback when the Onfido API is unavailable.

Runs on port **8001**.

## Endpoints

| Method | Path              | Description                                              |
| ------ | ----------------- | -------------------------------------------------------- |
| GET    | `/health`         | Liveness probe. Returns 200 immediately.                 |
| GET    | `/ready`          | Readiness probe. No external deps, so always ready.      |
| POST   | `/internal/check` | Run a document check. Body: `DocumentCheckRequest`.      |

### `POST /internal/check`

Request body (`DocumentCheckRequest`):

```json
{
  "nicImageBase64": "<base64-encoded image bytes>",
  "sessionId": "<session id>"
}
```

Response (`DocumentCheckResult`), serialised as **camelCase** for the
orchestrator: `status` (`completed`/`error`), `result`, `subResult`,
`extractedName`, `extractedDob`, `extractedNic`, `documentType`,
`issuingCountry`, `applicantId`, `documentId`, `onfidoReportId`,
`imageIntegrity`, `visualAuthenticity`, `confidence`, and `error`.

`applicantId` and `documentId` are the Onfido identifiers the **biometric**
service needs to run its facial-similarity check against the same
applicant/document, so they are always returned on a successful check.

## Flow

1. Create an Onfido applicant.
2. Upload the NIC image as a `national_identity_card` document.
3. Create a `document` report check.
4. Poll the report (every 2s, up to 15 attempts) until complete.

### Failure handling

The OCR fallback runs **only when Onfido is genuinely unavailable** (network,
timeout, or 5xx): it extracts the NIC via Tesseract (`sin+tam+eng`) and returns
`result="unidentified"`, `subResult="ocr_fallback"` with low confidence.
Auth/config errors (401/403), other 4xx, a polling timeout, and invalid input
instead return `status="error"` with an `error` code — they must not silently
degrade every request to low-confidence OCR.

## Environment variables

| Variable           | Default                              | Description                  |
| ------------------ | ------------------------------------ | ---------------------------- |
| `DOCUMENT_PORT`    | `8001`                               | Port the service listens on. |
| `ONFIDO_API_TOKEN` | `api_sandbox.replace-me`             | Onfido API token.            |
| `ONFIDO_BASE_URL`  | `https://api.eu.onfido.com/v3.6`     | Onfido API base URL.         |
| `AWS_REGION`       | `ap-south-1`                         | AWS region.                  |
| `AWS_S3_BUCKET`    | `kestrel-kyc-documents`              | S3 bucket for documents.     |
| `LOG_LEVEL`        | `debug`                              | Log level.                   |

## Running

```bash
docker build -t kestrel-document .
docker run -p 8001:8001 --env-file .env kestrel-document
```
