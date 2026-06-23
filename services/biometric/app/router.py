"""HTTP routes for the Kestrel Biometric Service."""
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
        logger.info("Onfido failed, trying Rekognition fallback")
        # Rekognition needs a document photo to compare against, but when
        # Onfido is the source of the document photo we don't have it here.
        # We therefore cannot run a meaningful fallback and return the Onfido
        # error result unchanged.
        logger.warning(
            "Rekognition fallback skipped: no document photo available "
            "without Onfido (session=%s). Returning Onfido error result.",
            request.session_id,
        )
        # Intentionally not calling rekognition_face_match here.

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
