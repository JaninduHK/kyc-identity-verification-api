# Kestrel Audit Service

Hash-chained, append-only audit log for the Kestrel KYC platform. Go /
chi / pgx, listens on port **8004**.

## Overview

Every audit event is appended to the `audit_events` table and linked to the
previous event by a SHA-256 hash chain, making tampering detectable: changing
any historical event's data invalidates the hash of every subsequent event.

## Hash chaining

The chain hash is computed by a single PostgreSQL `BEFORE INSERT` trigger
(`audit_events_chain`, migration `003`) that **every** writer shares — the Go
service and the `erase_session_pii()` PDPA function both just `INSERT` and let
the trigger fill `hash`. This guarantees one consistent chain with no drift.

For each new row the trigger:

1. Takes a transaction-scoped advisory lock so concurrent appends are
   serialized and can never read the same previous hash (no chain forks).
2. Reads the previous row's hash (empty string for the first event).
3. Computes the SHA-256 over the **whole record**, not just the payload:

   ```
   hash = SHA256(prevHash || session_id || client_id || event_type || actor || event_data)
   ```

   (nullable fields coalesced to `''`, `event_data` in normalized JSONB text).

Because the hash covers `session_id`, `client_id`, `event_type` and `actor` —
not only `event_data` — none of those columns can be altered undetectably.

To verify integrity, call `GET /internal/verify`, which recomputes the entire
chain from the first event and reports the first tampered row (if any).

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
  `sessionId` and `eventType` are required; `actor` is optional and now
  persisted (and hashed into the chain).
- `GET /internal/events/{sessionId}` — list events for a session (ordered by
  insertion):
  ```json
  {
    "sessionId": "sess-123",
    "events": [
      {
        "id": 1,
        "eventType": "document.verified",
        "actor": "orchestrator",
        "data": { "any": "json" },
        "hash": "<sha256-hex>",
        "createdAt": "2026-06-08T00:00:00Z"
      }
    ]
  }
  ```
- `GET /internal/verify` — recompute and verify the entire hash chain:
  ```json
  { "valid": true, "count": 42, "brokenAt": 0 }
  ```
  On tampering, `valid` is `false` and `brokenAt` is the `id` of the first row
  whose stored hash no longer matches. Always returns `200` (a broken chain is
  a result, not a request error).

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
| `actor` | `TEXT` (nullable) |
| `event_data` | `JSONB` |
| `hash` | `VARCHAR(64)` (filled by trigger) |
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
