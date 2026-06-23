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

`POST /internal/check` always returns HTTP 200 with a `BiometricCheckResult`.
Provider failures are captured in the `error` field rather than raised, so the
orchestrator decides how to react to error results.

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
  so `liveness_passed` is always `False` for Rekognition results. The fallback
  is gated behind `REKOGNITION_ENABLED` and requires a document photo to
  compare against.

## Dependencies

This service depends on the **document service** (port 8001), which registers
the applicant and document with Onfido and returns the `applicant_id` and
`document_id`. The biometric service requires both of these to run the Onfido
facial-similarity check, because Onfido links the selfie to the existing
applicant and document.
