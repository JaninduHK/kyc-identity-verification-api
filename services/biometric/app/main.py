"""Kestrel Biometric Service FastAPI application.

Liveness detection and face matching via Onfido (primary) with an AWS
Rekognition fallback. Runs on port 8002 and is called internally by the
Temporal orchestrator.
"""
import logging

from fastapi import FastAPI

from app.config import get_settings
from app.router import router

settings = get_settings()


def _configure_logging() -> None:
    """Configure JSON-style structured logging for the service."""
    logging.basicConfig(
        level=settings.LOG_LEVEL.upper(),
        format=(
            '{"time": "%(asctime)s", "level": "%(levelname)s", '
            '"service": "biometric", "msg": "%(message)s"}'
        ),
    )


_configure_logging()
logger = logging.getLogger("kestrel.biometric")

app = FastAPI(
    title="Kestrel Biometric Service",
    version="0.1.0",
    description="Liveness detection and face matching via Onfido",
)
app.include_router(router)


@app.on_event("startup")
async def on_startup() -> None:
    """Log service startup."""
    logger.info("Biometric service started on port %s", settings.BIOMETRIC_PORT)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.BIOMETRIC_PORT)
