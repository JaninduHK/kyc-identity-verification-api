# Kestrel Gateway

The **gateway** is the public API edge for the Kestrel KYC identity
verification platform. It terminates client traffic, authenticates API keys,
enforces per-client rate limits, and routes verification requests to the
internal **orchestrator** service. It is intentionally thin: it owns no
verification logic itself, only edge concerns.

## Responsibilities

- **Authentication** — validates API keys (SHA-256 hashed) against Postgres
  with a 5-minute Redis cache.
- **Rate limiting** — Redis sliding-window limiter (sorted set) keyed by client
  ID, default 100 requests / 60s.
- **Routing** — creates verification sessions and fires fire-and-forget start
  requests to the orchestrator.
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
| GET    | `/v1/webhooks`            | Yes  | Lists registered webhooks (stub). |
| POST   | `/v1/webhooks`            | Yes  | Registers a webhook (stub). |

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
  -d '{"nicImageBase64":"<base64>","selfieBase64":"<base64>","country":"LK"}'
```

```json
{ "sessionId": "…", "status": "processing" }
```

## Environment variables

| Variable               | Required | Default                   | Description |
|------------------------|----------|---------------------------|-------------|
| `GATEWAY_PORT`         | No       | `8080`                    | HTTP listen port. |
| `DATABASE_URL`         | Yes      | —                         | Postgres connection URL (pgx). |
| `REDIS_URL`            | Yes      | —                         | Redis connection URL (`redis://…`). |
| `DATABASE_ENCRYPT_KEY` | Yes      | —                         | 32-byte AES-256 key for PII encryption. |
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

The gateway reads/writes two tables owned by platform migrations:

- `api_keys(id, client_id, key_hash, key_prefix, environment, revoked, created_at)`
- `verification_sessions(id, client_id, status, workflow_type, country, risk_score, decision, …, created_at)`
