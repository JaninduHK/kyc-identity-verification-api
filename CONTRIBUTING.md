# Contributing to Kestrel

Thanks for your interest in contributing. This guide assumes you know how to
code but have never touched this specific project before — it walks through
what Kestrel is, how to get it running locally, and what we expect from a
pull request.

## Before You Start

- Read the [README](README.md) and understand the 8-service architecture —
  a public `gateway` fans work out to `orchestrator`, which runs a Temporal
  workflow across `document`, `biometric`, `aml`, `risk`, `audit`, and
  `notification`.
- Check existing [Issues](../../issues) before starting work — someone may
  already be working on the same thing.
- For large changes (new services, schema changes, anything touching risk
  scoring or compliance logic), open an Issue first and discuss the approach
  before writing code. This saves everyone time if the direction needs to
  change.

## Development Setup

1. Clone the repo.

2. Copy the environment template and fill in sandbox credentials:

   ```bash
   cp .env.example .env.local
   ```

   You'll need a free Onfido sandbox API token for the `document` and
   `biometric` services — sign up at [onfido.com/signup](https://onfido.com/signup)
   and use the sandbox token it gives you (`api_sandbox....`). Other
   third-party fields (ComplyAdvantage, MaxMind, Twilio, SendGrid) can be left
   as `replace-me` unless you're working on that specific integration.

3. Generate a local JWT signing keypair (used for session tokens):

   ```bash
   openssl genrsa -out keys/private.pem 2048
   openssl rsa -in keys/private.pem -pubout -out keys/public.pem
   ```

4. Start the stack:

   ```bash
   make dev-up
   ```

5. Verify every service is up before you start changing things — hit each
   service's `/health` endpoint (see the port table below), e.g.:

   ```bash
   curl http://localhost:8080/health   # gateway
   curl http://localhost:3001/health   # orchestrator
   ```

   All services should return `ok`.

6. Run the test suite:

   ```bash
   make test
   ```

## Which Service To Work On

| Service        | Language | Port | What it does                                     |
|----------------|----------|------|---------------------------------------------------|
| `gateway`      | Go       | 8080 | Client auth, rate limiting, public API, routing   |
| `orchestrator` | Node/TS  | 3001 | Temporal CDD/EDD workflows + activities           |
| `document`     | Python   | 8001 | Onfido document check + Tesseract OCR fallback    |
| `biometric`    | Python   | 8002 | Face match / liveness (Onfido + Rekognition)      |
| `aml`          | Node/TS  | 3002 | ComplyAdvantage screening + STR report filing     |
| `risk`         | Python   | 8003 | Rule-based risk scoring engine                    |
| `audit`        | Go       | 8004 | Hash-chained, append-only audit log               |
| `notification` | Node/TS  | 3003 | Webhooks (HMAC), email (SendGrid), SMS (Twilio)   |

If you're not sure where a change belongs, open an Issue and ask before
guessing — several services intentionally overlap in responsibility (e.g.
both `gateway` and `audit` care about tamper-evidence) and putting logic in
the wrong place can undermine a compliance guarantee elsewhere.

## Code Standards

**Go services:**
- Use `pgx/v5` for PostgreSQL, `go-redis/v9` for Redis.
- Structured logging with `slog` — never `fmt.Println` in production code.
- All HTTP handlers must recover from panics.
- Run `gofmt` and `golint` before committing.

**TypeScript services:**
- Strict mode, no `any` types (eslint will catch this).
- Use `pino` for logging.
- Every async function must have a `try`/`catch`.

**Python services:**
- Type hints on every function.
- Pydantic models for all request/response shapes.
- `pytest` for tests, aim for 80% coverage minimum on new code.

**All services:**
- Every service must expose `GET /health` and `GET /ready` endpoints.
- Never log PII — no NIC numbers, full names, or biometric data in logs.
  Log session IDs only.
- Never hardcode credentials — everything goes through environment
  variables.

## Testing

- Run the full test suite before submitting a PR: `make test`.
- New features need new tests — PRs without tests will not be merged.
- For services that call Onfido or ComplyAdvantage, mock the HTTP calls in
  tests. Do not make real API calls (even sandbox ones) in the test suite.

## Submitting a Pull Request

- Branch from `main`. Name your branch `feature/what-it-does` or
  `fix/what-it-fixes`.
- One PR per feature or fix — keep it reviewable.
- Fill in the PR template completely.
- Link to the Issue your PR addresses.
- Ensure CI passes (GitHub Actions runs automatically on every PR).

## What We Will NOT Accept

- Changes that log PII to console or files.
- Hardcoded credentials of any kind.
- Removing or weakening the audit log's tamper detection.
- Bypassing the PDPA erasure function.
- Dependencies with known high or critical CVEs.

## Compliance Note

This project operates in a regulated environment (KYC/AML in Sri Lanka).
Changes to risk scoring logic, AML screening, audit logging, or data
retention require extra review and must not be merged without maintainer
sign-off, regardless of how small the change looks.
