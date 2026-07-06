# Kestrel Biometric Service

A Python FastAPI microservice for KYC biometric verification: it performs
liveness detection and face matching via **Onfido** (primary) with an **AWS
Rekognition** fallback. It runs on port **8002** and is called internally by
the Temporal orchestrator.

## Environment variables

| Variable             | Required | Default                            | Description                                              |
| -------------------- | -------- | ---------------------------------- | -------------------------------------------------------- |
| `ONFIDO_API_TOKEN`   | Yes      | `""`                               | Onfido API token (empty allows boot but live calls fail).|
| `ONFIDO_BASE_URL`    | No       | `https://api.eu.onfido.com/v3.6`   | Onfido API base URL.                                     |
| `AWS_REGION`         | No       | `ap-south-1`                       | AWS region for Rekognition.                              |
| `REKOGNITION_ENABLED`| No       | `False`                            | Enable the AWS Rekognition fallback path.                |
| `BIOMETRIC_PORT`     | No       | `8002`                             | Port the service listens on.                             |
| `LOG_LEVEL`          | No       | `INFO`                             | Logging level.                                           |

## Endpoints

| Method | Path              | Description                                                       |
| ------ | ----------------- | ----------------------------------------------------------------- |
| POST   | `/internal/check` | Run a biometric check. Body: `BiometricCheckRequest`. Returns 200.|
| GET    | `/health`         | Liveness probe. Returns `HealthResponse` with status 200.         |
| GET    | `/ready`          | Readiness probe. Returns `{"status": "ready"}` (no DB dependency). |

`POST /internal/check` always returns HTTP 200 with a `BiometricCheckResult`.
Provider failures are captured in the `error` field rather than raised, so the
orchestrator decides how to react to error results.

### Wire format (camelCase)

The service is called by the Node/TS orchestrator, so request and response
bodies use **camelCase** on the wire (`selfieBase64`, `applicantId`,
`documentId`, `sessionId`, `docPhotoBase64`; `faceMatch`, `similarityScore`,
`livenessPassed`, `onfidoReportId`). Snake_case keys are also accepted for
convenience, so both `selfie_base64` and `selfieBase64` work.

Request fields:

| Field            | Required | Description                                                     |
| ---------------- | -------- | --------------------------------------------------------------- |
| `applicantId`    | Yes      | Onfido applicant ID (from the document service).                |
| `documentId`     | Yes      | Onfido document ID (from the document service).                 |
| `selfieBase64`   | Yes      | base64 JPEG/PNG selfie to verify.                               |
| `sessionId`      | Yes      | Session ID for logging and tracing.                             |
| `docPhotoBase64` | No       | base64 document face photo; **required to enable the fallback**.|

## How to run locally

```bash
pip install -r requirements.txt
python -m app.main
```

## How to run tests

```bash
pytest tests/ -v
```

## Provider details

- **Onfido (primary)** — uploads the selfie as a live photo, creates a
  `facial_similarity_photo` check against the existing applicant and document,
  and polls the report. It returns both a face-match result (`clear` /
  `consider` / `unidentified`) and a liveness signal derived from the report's
  `image_integrity` breakdown.
- **AWS Rekognition (fallback)** — performs a direct image-to-image face
  comparison via `compare_faces`. It does **not** perform liveness detection,
  so `livenessPassed` is always `False` for Rekognition results. The fallback
  runs when **all** of the following hold: the Onfido check returned an error,
  `REKOGNITION_ENABLED=true`, and the request supplied a `docPhotoBase64` to
  compare against (Onfido otherwise holds the only document photo). The blocking
  boto3 call is dispatched off the event loop via `asyncio.to_thread`. If any
  condition is unmet the Onfido error result is returned unchanged.

## Dependencies

This service depends on the **document service** (port 8001), which registers
the applicant and document with Onfido and returns the `applicant_id` and
`document_id`. The biometric service requires both of these to run the Onfido
facial-similarity check, because Onfido links the selfie to the existing
applicant and document.
