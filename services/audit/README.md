# Kestrel Audit Service

Hash-chained, append-only audit log for the Kestrel KYC platform. Go /
chi / pgx, listens on port **8004**.

## Overview

Every audit event is appended to the `audit_events` table and linked to the
previous event by a SHA-256 hash chain, making tampering detectable: changing
any historical event's data invalidates the hash of every subsequent event.

## Hash chaining

For each new event the service:

1. Reads the hash of the most recently inserted row
   (`SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1`). For the very
   first event the previous hash is the empty string.
2. Computes `hash = SHA256Hex(prevHash + string(event.data))`.
3. Inserts the row with the computed hash.

Because each hash incorporates the previous hash, the entire log forms a chain
anchored from the first event. To verify integrity, recompute the chain from
the start and compare each stored hash.

## Endpoints

- `GET /health` → `200 {"status":"ok","service":"audit","version":"0.1.0"}`
  (liveness, returns immediately — no dependency checks)
- `GET /ready` → `200 {"status":"ready"}` when the database is reachable,
  otherwise `503 {"status":"unavailable"}`
- `POST /internal/events` — record an event:
  ```json
  {
    "sessionId": "sess-123",
    "clientId": "client-1",
    "eventType": "document.verified",
    "actor": "orchestrator",
    "data": { "any": "json" }
  }
  ```
  → `201 {"hash":"<sha256-hex>","status":"recorded"}`
  `sessionId` and `eventType` are required.
- `GET /internal/events/{sessionId}` — list events for a session (ordered by
  insertion):
  ```json
  {
    "sessionId": "sess-123",
    "events": [
      {
        "id": 1,
        "eventType": "document.verified",
        "data": { "any": "json" },
        "hash": "<sha256-hex>",
        "createdAt": "2026-06-08T00:00:00Z"
      }
    ]
  }
  ```

Error responses use the shape `{"error":"code","message":"..."}`.

## Database

The service expects the `audit_events` table to be created by migrations
elsewhere:

| Column | Type |
|--------|------|
| `id` | `BIGSERIAL` |
| `session_id` | `TEXT` |
| `client_id` | `TEXT` (nullable) |
| `event_type` | `TEXT` |
| `event_data` | `JSONB` |
| `hash` | `VARCHAR(64)` |
| `created_at` | `TIMESTAMPTZ` |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUDIT_PORT` | `8004` | HTTP listen port |
| `DATABASE_URL` | _(required)_ | PostgreSQL connection string; service fails fast if missing |
| `LOG_LEVEL` | `info` | Logging level |

## Running locally

```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/kestrel"
go run .
```

## Docker

```bash
docker build -t kestrel-audit .
docker run -p 8004:8004 -e DATABASE_URL="postgres://..." kestrel-audit
```
