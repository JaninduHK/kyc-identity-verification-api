"""Kestrel Biometric Service FastAPI application."""
import json
import logging
import sys

from fastapi import FastAPI, HTTPException

from app.config import settings
from app.models import BiometricCheckRequest, BiometricCheckResult
from app.onfido_biometric import run_biometric_check


class JsonFormatter(logging.Formatter):
    """Lightweight JSON log formatter."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "time": self.formatTime(record),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())


_configure_logging()
logger = logging.getLogger("kestrel.biometric")

app = FastAPI(title="Kestrel Biometric Service", version="0.1.0")


@app.get("/health")
async def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "service": "biometric", "version": "0.1.0"}


@app.get("/ready")
async def ready() -> dict:
    """Readiness probe. This service has no DB, so it is always ready."""
    return {"status": "ready"}


@app.post("/internal/check", response_model=BiometricCheckResult)
async def internal_check(req: BiometricCheckRequest) -> BiometricCheckResult:
    """Run an internal biometric verification check."""
    try:
        return await run_biometric_check(
            req.applicant_id, req.selfie_base64, req.document_id
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Biometric check failed")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.biometric_port)
