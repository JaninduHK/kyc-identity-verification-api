# Kestrel Biometric Service

FastAPI microservice for KYC biometric verification on the Kestrel platform.
It performs facial similarity and liveness checks via Onfido, with an AWS
Rekognition fallback for face matching.

Runs on port **8002**.

## Endpoints

| Method | Path              | Description                                          |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/health`         | Liveness probe. Returns 200 immediately.             |
| GET    | `/ready`          | Readiness probe. No external deps, so always ready.  |
| POST   | `/internal/check` | Run a biometric check. Body: `BiometricCheckRequest`.|

### `POST /internal/check`

Request body (`BiometricCheckRequest`):

```json
{
  "applicant_id": "<onfido applicant id, optional>",
  "selfie_base64": "<base64-encoded selfie image>",
  "document_id": "<onfido document id, optional>",
  "session_id": "<session id>"
}
```

Response (`BiometricCheckResult`): includes `result`, `face_match`,
`similarity_score`, `liveness_passed`, and `source`.

## Flow

1. Upload the selfie as an Onfido live photo.
2. Create a `facial_similarity_photo` report check.
3. Poll the report (every 2s, up to 15 attempts) until complete.
4. Build the result; on failure return `result="error"` with `source="onfido"`.
   An AWS Rekognition fallback (`rekognition_face_match`) is available for
   direct face comparison.

## Environment variables

| Variable           | Default                              | Description                  |
| ------------------ | ------------------------------------ | ---------------------------- |
| `BIOMETRIC_PORT`   | `8002`                               | Port the service listens on. |
| `ONFIDO_API_TOKEN` | `api_sandbox.replace-me`             | Onfido API token.            |
| `ONFIDO_BASE_URL`  | `https://api.eu.onfido.com/v3.6`     | Onfido API base URL.         |
| `AWS_REGION`       | `ap-south-1`                         | AWS region.                  |
| `LOG_LEVEL`        | `debug`                              | Log level.                   |

## Running

```bash
docker build -t kestrel-biometric .
docker run -p 8002:8002 --env-file .env kestrel-biometric
```
