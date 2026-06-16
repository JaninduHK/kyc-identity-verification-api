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

Response (`DocumentCheckResult`): includes `onfido_report_id`, `result`,
`sub_result`, `extracted_name`, `extracted_dob`, `extracted_nic`,
`document_type`, `issuing_country`, `image_integrity`, `visual_authenticity`,
and `confidence`.

## Flow

1. Create an Onfido applicant.
2. Upload the NIC image as a `national_identity_card` document.
3. Create a `document` report check.
4. Poll the report (every 2s, up to 15 attempts) until complete.
5. On any failure, fall back to Tesseract OCR (`sin+tam+eng`) to extract the
   NIC number, returning `result="unidentified"` with low confidence.

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
