# Kestrel Risk Service

Rule-based risk scoring microservice for the Kestrel KYC platform. Python /
FastAPI, listens on port **8003**.

## Overview

The orchestrator gathers results from the document, biometric, AML and IP
checks and POSTs them to this service, which applies a set of additive rules to
produce a single risk score (0–100) plus the list of factors that contributed.

## Scoring rules

Each rule is additive; when triggered it appends a factor string. The final
score is capped at `100.0`.

| Condition | Points | Factor |
|-----------|-------:|--------|
| `document.result == "consider"` | +60 | `document_result_consider` |
| `aml.riskLevel` / `aml.risk_level == "high"` | +80 | `aml_high_risk` |
| `biometric.result == "consider"` | +50 | `biometric_consider` |
| `biometric.result == "unidentified"` | +40 | `biometric_unidentified` |
| `biometric.result == "error"` | +40 | `biometric_error` |
| `biometric.livenessPassed == false` (real check only) | +20 | `biometric_liveness_failed` |
| `document.imageIntegrity` / `image_integrity .result == "consider"` | +70 | `image_integrity_consider` |
| `aml.riskLevel` / `aml.risk_level == "medium"` | +20 | `aml_medium_risk` |
| `ip.isVpn` / `ip.is_vpn` truthy | +15 | `ip_vpn` |
| `ip.isProxy` / `ip.is_proxy` truthy | +20 | `ip_proxy` |
| `ip.ipRiskScore` / `ip.ip_risk_score > 60` | +10 | `ip_high_risk_score` |
| `document.result == "unidentified"` | +25 | `document_unidentified` |

Inputs are loosely-typed dicts; all lookups are defensive (`.get()`), and both
camelCase and snake_case key variants are accepted where noted.

Example: a `document.result == "consider"` (+60) together with
`aml.riskLevel == "high"` (+80) sums to 140 and is capped at **100.0**.

## Endpoints

- `GET /health` → `{"status":"ok","service":"risk","version":"0.1.0"}` (liveness, immediate)
- `GET /ready` → `{"status":"ready"}` (no external dependencies)
- `POST /internal/score` → body `RiskScoreRequest`, returns `RiskScoreResult`
  ```json
  { "sessionId": "...", "document": {}, "biometric": {}, "aml": {}, "ip": {} }
  ```
  →
  ```json
  { "score": 100.0, "factors": ["document_result_consider", "aml_high_risk"] }
  ```
- `POST /internal/ip` → body `{ "sessionId": "...", "ipAddress": "..." }`, returns a
  rule-based IP risk result derived from the address (see `app/ip_risk.py`):
  ```json
  {
    "ipRiskScore": 80.0, "isVpn": true, "isProxy": true, "country": null,
    "factors": ["datacenter_ip"], "checkType": "ip",
    "provider": "rule-based", "status": "complete"
  }
  ```
  Private/reserved IPs score `0`; known datacenter/hosting ranges are flagged as
  proxy/VPN (`80`); other public IPs get a low baseline (`10`). A production
  deployment would back this with a MaxMind / IP-intelligence lookup.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RISK_PORT` | `8003` | HTTP listen port |
| `LOG_LEVEL` | `debug` | Logging level |

Loaded via `pydantic-settings` from the environment or a `.env` file
(case-insensitive, unknown keys ignored).

## Running locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8003
# or
python -m app.main
```

## Docker

```bash
docker build -t kestrel-risk .
docker run -p 8003:8003 kestrel-risk
```
