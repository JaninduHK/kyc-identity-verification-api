"""Kestrel Risk Service — rule-based KYC risk scoring API."""

import json
import logging
from typing import Any

from fastapi import Body, FastAPI, HTTPException

from app.config import settings
from app.ip_risk import assess_ip
from app.models import RiskScoreRequest, RiskScoreResult
from app.scoring import rule_based_score

SERVICE_NAME = "risk"
SERVICE_VERSION = "0.1.0"


class JsonLogFormatter(logging.Formatter):
    """Minimal JSON log formatter."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
            "service": SERVICE_NAME,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _configure_logging() -> logging.Logger:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
    return logging.getLogger(SERVICE_NAME)


logger = _configure_logging()

app = FastAPI(title="Kestrel Risk Service", version=SERVICE_VERSION)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — returns immediately."""
    return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}


@app.get("/ready")
def ready() -> dict[str, str]:
    """Readiness probe. The risk service has no external dependencies."""
    return {"status": "ready"}


@app.post("/internal/score", response_model=RiskScoreResult)
def score(request: RiskScoreRequest) -> RiskScoreResult:
    """Compute a rule-based risk score from upstream check results."""
    try:
        merged: dict[str, Any] = {
            "document": request.document,
            "biometric": request.biometric,
            "aml": request.aml,
            "ip": request.ip,
        }
        total, factors = rule_based_score(merged)
        logger.debug(
            "scored session %s -> %s (%s)", request.sessionId, total, factors
        )
        return RiskScoreResult(score=total, factors=factors)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface as 500
        logger.exception("scoring failed for session %s", request.sessionId)
        raise HTTPException(status_code=500, detail="scoring_failed") from exc


@app.post("/internal/ip")
def ip_check(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    """Rule-based IP risk lookup.

    The orchestrator calls ``RISK_URL/internal/ip`` with ``{sessionId, ipAddress}``.
    Assessment is derived from the actual IP (private/datacenter/public); see
    ``app.ip_risk``.
    """
    try:
        session_id = payload.get("sessionId")
        ip_address = payload.get("ipAddress")
        assessment = assess_ip(ip_address)
        logger.debug(
            "ip check for session %s -> %s (%s)",
            session_id,
            assessment["ipRiskScore"],
            assessment["factors"],
        )
        return {
            "ipRiskScore": assessment["ipRiskScore"],
            "isVpn": assessment["isVpn"],
            "isProxy": assessment["isProxy"],
            "country": assessment["country"],
            "factors": assessment["factors"],
            "checkType": "ip",
            "provider": "rule-based",
            "status": "complete",
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface as 500
        logger.exception("ip check failed")
        raise HTTPException(status_code=500, detail="ip_check_failed") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.risk_port,
        log_level=settings.log_level,
    )
