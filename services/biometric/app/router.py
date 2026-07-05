"""HTTP routes for the Kestrel Biometric Service."""
import asyncio
import logging

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.models import BiometricCheckRequest, BiometricCheckResult, HealthResponse
from app.onfido_biometric import run_biometric_check
from app.rekognition_fallback import rekognition_face_match

logger = logging.getLogger("kestrel.biometric.router")

router = APIRouter(prefix="")


@router.post("/internal/check", response_model=BiometricCheckResult)
async def internal_check(
    request: BiometricCheckRequest,
    settings: Settings = Depends(get_settings),
) -> BiometricCheckResult:
    """Run a biometric check via Onfido, falling back to Rekognition.

    Always returns HTTP 200 with a :class:`BiometricCheckResult`; provider
    failures are reported in ``result.error`` for the orchestrator to handle.
    """
    logger.info("Biometric check starting: session=%s", request.session_id)

    result = await run_biometric_check(request, settings)

    if result.error is not None and settings.REKOGNITION_ENABLED:
        if request.doc_photo_base64:
            logger.info(
                "Onfido failed, running Rekognition fallback: session=%s",
                request.session_id,
            )
            # boto3 is blocking, so run the compare off the event loop to keep
            # the service responsive under concurrent checks.
            fallback = await asyncio.to_thread(
                rekognition_face_match,
                request.selfie_base64,
                request.doc_photo_base64,
                settings,
                request.session_id,
            )
            result = fallback
        else:
            # Rekognition needs a document photo to compare against. When Onfido
            # is the source of the document photo we don't have one here, so the
            # fallback cannot run and we return the Onfido error result.
            logger.warning(
                "Rekognition fallback skipped: no doc_photo_base64 supplied "
                "(session=%s). Returning Onfido error result.",
                request.session_id,
            )

    logger.info(
        "Biometric check finished: session=%s result=%s face_match=%s "
        "similarity_score=%s source=%s",
        request.session_id,
        result.result,
        result.face_match,
        result.similarity_score,
        result.source,
    )
    return result


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe."""
    return HealthResponse(status="ok", service="biometric", version="0.1.0")


@router.get("/ready")
async def ready() -> dict:
    """Readiness probe. This service has no DB, so it is always ready."""
    return {"status": "ready"}
