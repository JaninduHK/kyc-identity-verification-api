# Orchestrator Service

The orchestrator is the Temporal.io-based coordinator for the Kestrel KYC platform. It runs
durable workflows that fan out to the downstream verification microservices (document, biometric,
AML, IP-risk, risk-scoring), aggregates their results, persists a decision, writes an audit trail,
and optionally fires a customer webhook.

## Architecture

The service has two runnable entrypoints that share the same code base:

- **Worker** (`dist/worker.js`, default container `CMD`) — connects to Temporal, registers the
  workflows and activities on the `kestrel-kyc` task queue, and executes workflow/activity tasks.
  This is where all the verification logic and downstream IO actually runs.
- **Server** (`dist/server.js`) — a thin Express HTTP API used by the rest of the platform to
  start verifications and query their status. It is a Temporal *client*; it never executes
  workflow logic itself, it only enqueues work and reads workflow state.

Both must run for the service to function: the server schedules workflows, the worker runs them.
In `docker-compose` they are launched as two processes from the same image (override the `CMD`
for the server to `node dist/server.js`).

### Temporal sandbox constraints

Workflow code (`src/workflows/*`) is deterministic and runs in the Temporal sandbox. It only
imports from `@temporalio/workflow` and uses `import type` for activities and shared types. All
IO (HTTP, Postgres) lives in activities (`src/activities/*`), which run outside the sandbox.

## Workflows

Both workflows share `runAllChecks` and `finalize` (see `src/workflows/pipeline.ts`) and differ
only in the decision function (`src/workflows/decision.ts`).

Check orchestration (`runAllChecks`): document and biometric run as a **sequential chain** —
biometric needs the Onfido `applicantId`/`documentId` the document check produces — while AML and
IP run **concurrently** alongside them (`Promise.allSettled`). Biometric is skipped (not failed)
when no selfie was supplied or the document check yielded no IDs. Risk scoring runs last over the
aggregated results.

- `cddWorkflow` — Customer Due Diligence. Decision from the risk score:
  - `score < 30` → `approved`
  - `30 <= score <= 70` → `manual_review`
  - `score > 70` → `rejected`
- `eddWorkflow` — Enhanced Due Diligence, materially stricter (`eddDecision`): rejects on any
  high-risk/STR AML hit, sends any other AML match or any non-clear / non-live biometric to
  `manual_review`, and approves straight-through only below a score of 15. Emits an
  `EDD_MANUAL_REVIEW_REQUIRED` audit event when it lands in manual review.

### Retries & failure handling

Activities **rethrow** downstream failures so Temporal's `maximumAttempts: 3` retry actually
fires (they no longer swallow errors and return defaults). After retries are exhausted, the
workflow degrades gracefully: document/biometric/AML/IP fall back to an `error` result via
`Promise.allSettled`, and risk falls back to a neutral score. Persistence and audit are essential
(a final failure fails the workflow visibly); the webhook is best-effort because the notification
service performs its own durable retries. `saveVerificationResult` writes one `verification_checks`
row per check inside an idempotent transaction (safe to retry).

## HTTP Endpoints (server)

| Method | Path                      | Description |
| ------ | ------------------------- | ----------- |
| GET    | `/health`                 | Liveness. `{ "status": "ok", "service": "orchestrator", "version": "0.1.0" }` |
| GET    | `/ready`                  | Readiness. Checks Temporal connectivity. `200 { "status": "ready" }` or `503`. |
| POST   | `/internal/verify/start`  | Start a verification. Body: `CDDInput` + `workflowType` (`cdd`/`edd`). Returns `202 { workflowId, runId, sessionId }`. |
| GET    | `/internal/sessions/:id`  | Workflow status for `verify-:id`. |

All errors return `{ "error": "code", "message": "description", "statusCode": number }`.

## Environment variables

| Variable             | Required | Default                  |
| -------------------- | -------- | ------------------------ |
| `ORCHESTRATOR_PORT`  | no       | `3001`                   |
| `TEMPORAL_ADDRESS`   | no       | `localhost:7233`         |
| `TEMPORAL_NAMESPACE` | no       | `kestrel-kyc`            |
| `DATABASE_URL`       | yes      | —                        |
| `REDIS_URL`          | yes      | —                        |
| `RABBITMQ_URL`       | yes      | —                        |
| `DOCUMENT_URL`       | no       | `http://document:8001`   |
| `BIOMETRIC_URL`      | no       | `http://biometric:8002`  |
| `AML_URL`            | no       | `http://aml:3002`        |
| `RISK_URL`           | no       | `http://risk:8003`       |
| `AUDIT_URL`          | no       | `http://audit:8004`      |
| `NOTIFICATION_URL`   | no       | `http://notification:3003` |
| `IP_RISK_URL`        | no       | falls back to `RISK_URL` |
| `LOG_LEVEL`          | no       | `info`                   |

Required variables are validated at startup; the process throws and exits if any are missing.

## Scripts

```sh
npm run build        # tsc -> dist/
npm start            # run the worker (dist/worker.js)
npm run start:server # run the HTTP server (dist/server.js)
npm run dev          # run the worker via ts-node
npm test             # jest
```
