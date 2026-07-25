# Kestrel KYC

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/JaninduHK/KYC-identity-verification-API/actions/workflows/test.yml/badge.svg)](https://github.com/JaninduHK/KYC-identity-verification-API/actions/workflows/test.yml)

**Kestrel Technologies (Pvt) Ltd** — a microservices-based KYC & identity
verification API for the Sri Lankan market (NIC + eNIC, AML/sanctions screening,

biometric face match, PDPA-compliant data handling).

### ⚠️ Legal Disclaimer

This software is provided for educational and informational purposes.

**It does not constitute legal, compliance, or regulatory advice.**

Users are solely responsible for:
- Obtaining all required regulatory approvals in their jurisdiction
- Ensuring compliance with applicable KYC/AML laws and regulations  
- Signing Data Processing Agreements with all third-party sub-processors (Onfido, ComplyAdvantage, etc.)
- Registering with relevant data protection authorities (in Sri Lanka: the Data Protection Authority under PDPA No. 9 of 2022)
- Obtaining institutional agreements required for any government database integrations

In Sri Lanka, access to the DRP (Department of Registration of Persons) NIC database requires a formal institutional agreement under FIU Guideline No. 03/2020. **This software does not provide that access.**

Kestrel Technologies (Pvt) Ltd accepts no liability for regulatory non-compliance arising from use of this software.

## Architecture

A public **gateway** authenticates clients and forwards verification requests to
an **orchestrator** that runs a Temporal workflow. The workflow fans out to
specialist services (document, biometric, AML, risk), aggregates a risk score,
makes a decision, writes an immutable audit record, and fires a webhook.

```
            ┌──────────┐   202    ┌──────────────┐  Temporal   ┌────────────────────┐
  client ──▶│ gateway  │─────────▶│ orchestrator │────────────▶│ cdd / edd workflow │
            │  (Go)    │          │ (Node/TS)    │             └─────────┬──────────┘
            └──────────┘          └──────────────┘     parallel activities│
                                                ┌──────────────┬──────────┼───────────┬────────────┐
                                                ▼              ▼          ▼           ▼            ▼
                                          document       biometric      aml         risk        audit
                                          (Python)       (Python)    (Node/TS)    (Python)       (Go)
                                                                        │                          ▲
                                                                        └─ STR report ─▶ notification (Node/TS) ─ webhook/email/sms
```

Infrastructure: **PostgreSQL 16**, **Redis 7.2**, **RabbitMQ 3.13**,
**Temporal 1.24**. Local orchestration via Docker Compose; production via
Kubernetes (`infra/k8s`) with AWS resources provisioned by Terraform
(`infra/terraform`).

## Quick start

```bash
cp .env.example .env.local          # fill in real provider keys as needed
make dev-up                         # build + start the full stack
make db-seed                        # load test clients + sandbox API keys

# fire a verification (sandbox key from database/seeds/test_data.sql)
curl -s http://localhost:8080/v1/verify/individual \
  -H "X-API-Key: ksk_sandbox_test_alpha_0001" \
  -H "Content-Type: application/json" \
  -d '{"nicImageBase64":"<base64-nic-image>","workflowType":"cdd"}'
```

`make help` lists every task. Useful endpoints once up:
Temporal UI → http://localhost:8088 · RabbitMQ → http://localhost:15672.

## Services & team assignments

| Service        | Lang        | Port | Owning             | Responsibility                                   |
|----------------|-------------|------|--------------------|--------------------------------------------------|
| `gateway`      | Go          | 8080 | Platform / Edge    | Auth, rate limiting, public API, routing         |
| `orchestrator` | Node/TS     | 3001 | Workflow           | Temporal CDD/EDD workflows + activities          |
| `document`     | Python      | 8001 | Verification       | Onfido document check + Tesseract OCR fallback   |
| `biometric`    | Python      | 8002 | Verification       | Face match / liveness (Onfido + Rekognition)     |
| `aml`          | Node/TS     | 3002 | Compliance         | ComplyAdvantage screening + STR report filing    |
| `risk`         | Python      | 8003 | Risk & Data        | Rule-based risk scoring engine                   |
| `audit`        | Go          | 8004 | Platform / Trust   | Hash-chained, append-only audit log              |
| `notification` | Node/TS     | 3003 | Growth / Messaging | Webhooks (HMAC), email (SendGrid), SMS (Twilio)  |

SDK: `sdk/javascript` (`@kestrel/sdk`). Infra: `infra/`.

## Repository layout

```
database/     SQL migrations (auto-run on postgres init) + seeds
services/     the 8 microservices, each with its own README + Dockerfile
sdk/          client SDKs (JavaScript/TypeScript)
infra/        terraform/ (AWS) · k8s/ (manifests)
.github/      CI (test.yml) and CD (deploy.yml) workflows
```

## Compliance notes

- **PDPA**: PII columns are AES-256-GCM encrypted at the gateway; sessions carry
  a 5-year `retention_until`; `erase_session_pii()` (migration `002`) performs
  right-to-erasure and records a `PDPA_ERASURE` audit event.
- **Audit integrity**: `audit_events` is append-only — `UPDATE`/`DELETE` are
  blocked by DB rules, and rows are SHA-256 hash-chained.
- **AML**: sanction hits auto-generate a Suspicious Transaction Report (STR) PDF
  to S3 (KMS-encrypted) and alert the compliance officer.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

To report a security vulnerability, see [SECURITY.md](SECURITY.md). Do not open a public issue for security problems.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for the full text.

Third-party provider integrations (Onfido, ComplyAdvantage, etc.) are subject to their own separate terms of service. See [PROVIDERS.md](PROVIDERS.md) for details.
