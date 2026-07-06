# Kestrel Gateway

The **gateway** is the public API edge for the Kestrel KYC identity
verification platform. It terminates client traffic, authenticates API keys,
enforces per-client rate limits, and routes verification requests to the
internal **orchestrator** service. It is intentionally thin: it owns no
verification logic itself, only edge concerns.

## Responsibilities

- **Authentication** — validates API keys (SHA-256 hashed) against Postgres
  with a short (30s) Redis cache so revocations take effect quickly.
- **Rate limiting** — Redis sliding-window limiter (sorted set) keyed by client
  ID, default 100 requests / 60s.
- **PII protection** — encrypts `name`/`dob` with AES-256-GCM before storing
  them in the `verification_sessions` PII columns; captures the client IP; and
  records the webhook URL. Request bodies are capped at 12 MiB.
- **Routing** — creates verification sessions and dispatches start requests to
  the orchestrator. If dispatch fails, the session is marked `failed` rather
  than left stuck in `processing`.
- **Observability** — structured JSON request logging via `slog`, panic
  recovery, and liveness/readiness probes.

## Endpoints

| Method | Path                      | Auth | Description |
|--------|---------------------------|------|-------------|
| GET    | `/health`                 | No   | Liveness; returns 200 immediately. |
| GET    | `/ready`                  | No   | Readiness; pings Postgres and Redis. 200 when both healthy, 503 otherwise. |
| POST   | `/v1/verify/individual`   | Yes  | Starts an individual KYC verification. Returns 202 with `sessionId`. |
| GET    | `/v1/sessions/{id}`       | Yes  | Returns a single verification session (no PII). |
| GET    | `/v1/sessions`            | Yes  | Lists sessions with `?limit` (default 20, max 100) and `?offset`. |
| GET    | `/v1/webhooks`            | Yes  | Lists the client's registered webhooks. |
| POST   | `/v1/webhooks`            | Yes  | Registers a webhook. Body `{ "url": "https://…", "description": "…" }`; returns 201. |

### Authentication

Provide the API key via either header:

```
X-API-Key: <key>
Authorization: Bearer <key>
```

### Error responses

All errors use a consistent JSON shape:

```json
{ "error": "code", "message": "human readable description" }
```

Common codes: `unauthorized` (401), `invalid_request` (400), `not_found` (404),
`rate_limited` (429), `internal_error` (500).

### Example: start a verification

```bash
curl -X POST http://localhost:8080/v1/verify/individual \
  -H "X-API-Key: $KESTREL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"nicImageBase64":"<base64>","selfieBase64":"<base64>","name":"Nimal Perera","dob":"1990-05-01","country":"LK"}'
```

`name` and `dob` are optional; when supplied they are encrypted at rest and
forwarded to AML screening.

```json
{ "sessionId": "…", "status": "processing" }
```

## Environment variables

| Variable               | Required | Default                   | Description |
|------------------------|----------|---------------------------|-------------|
| `GATEWAY_PORT`         | No       | `8080`                    | HTTP listen port. |
| `DATABASE_URL`         | Yes      | —                         | Postgres connection URL (pgx). |
| `REDIS_URL`            | Yes      | —                         | Redis connection URL (`redis://…`). |
| `DATABASE_ENCRYPT_KEY` | Yes      | —                         | Secret for PII encryption; SHA-256 derives a 32-byte AES-256 key from it (any encoding works). |
| `ORCHESTRATOR_URL`     | No       | `http://orchestrator:3001`| Base URL of the orchestrator service. |
| `LOG_LEVEL`            | No       | `info`                    | One of `debug`, `info`, `warn`, `error`. |

Configuration is validated at startup; the process exits non-zero if any
required variable is missing (fail fast).

## Running locally

```bash
go run .
```

## Building the container

```bash
docker build -t kestrel/gateway:0.1.0 .
```

Multi-stage build: compiles a static binary with `golang:1.22-alpine`, then
ships it on `gcr.io/distroless/static-debian12`.

## Backing tables

The gateway reads/writes tables owned by platform migrations:

- `api_keys(id, client_id, key_hash, key_prefix, environment, revoked, created_at)`
- `verification_sessions(id, client_id, status, workflow_type, country, name_encrypted, dob_encrypted, ip_address, webhook_url, risk_score, decision, …, created_at)`
- `webhooks(id, client_id, url, description, active, created_at)` — migration `004`
