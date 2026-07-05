"""Kestrel Biometric Service FastAPI application.

Liveness detection and face matching via Onfido (primary) with an AWS
Rekognition fallback. Runs on port 8002 and is called internally by the
Temporal orchestrator.
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

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


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Log service startup and shutdown."""
    logger.info("Biometric service started on port %s", settings.BIOMETRIC_PORT)
    yield
    logger.info("Biometric service shutting down")


app = FastAPI(
    title="Kestrel Biometric Service",
    version="0.1.0",
    description="Liveness detection and face matching via Onfido",
    lifespan=lifespan,
)
app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.BIOMETRIC_PORT)
