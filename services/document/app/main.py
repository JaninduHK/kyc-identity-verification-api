"""Kestrel Document Service FastAPI application."""
import json
import logging
import sys

from fastapi import FastAPI, HTTPException

from app.config import settings
from app.models import DocumentCheckRequest, DocumentCheckResult
from app.onfido_client import check_document


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
logger = logging.getLogger("kestrel.document")

app = FastAPI(title="Kestrel Document Service", version="0.1.0")


@app.get("/health")
async def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "service": "document", "version": "0.1.0"}


@app.get("/ready")
async def ready() -> dict:
    """Readiness probe. This service has no DB, so it is always ready."""
    return {"status": "ready"}


@app.post("/internal/check", response_model=DocumentCheckResult)
async def internal_check(req: DocumentCheckRequest) -> DocumentCheckResult:
    """Run an internal document verification check.

    ``check_document`` captures provider failures in the result (status/error)
    rather than raising, so a 500 here means an unexpected internal fault; we
    return a generic message and keep the detail in the logs.
    """
    try:
        return await check_document(req.nicImageBase64, req.sessionId)
    except Exception:  # noqa: BLE001
        logger.exception("Document check failed for session %s", req.sessionId)
        raise HTTPException(status_code=500, detail="internal_error")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.document_port)
