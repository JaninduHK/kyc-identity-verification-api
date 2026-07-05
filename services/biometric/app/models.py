"""Pydantic v2 models for the Kestrel Biometric Service.

Both models use a camelCase alias generator with ``populate_by_name=True`` so
they interoperate with the Node/TS orchestrator (which speaks camelCase over
the wire) while still accepting snake_case field names from Python callers and
tests. FastAPI serialises responses by alias, so the orchestrator receives
``faceMatch`` / ``similarityScore`` / ``livenessPassed`` etc.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """Base model that accepts/emits camelCase aliases and snake_case names."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class BiometricCheckRequest(_CamelModel):
    """Request payload for an internal biometric check."""

    applicant_id: str = Field(..., description="Onfido applicant ID from document service")
    selfie_base64: str = Field(..., description="base64 encoded JPEG/PNG selfie")
    document_id: str = Field(..., description="Onfido document ID from document service")
    session_id: str = Field(..., description="for logging and tracing")
    # Optional NIC/document face photo. When provided it enables the AWS
    # Rekognition fallback (image-to-image compare) if Onfido fails; without it
    # the fallback cannot run because Onfido otherwise holds the document photo.
    doc_photo_base64: Optional[str] = Field(
        default=None,
        description="base64 document face photo; enables the Rekognition fallback",
    )


class BiometricCheckResult(_CamelModel):
    """Result of a biometric (facial similarity / liveness) check.

    This object is always returned to the caller — provider failures are
    captured in :attr:`error` rather than raised to the orchestrator.
    """

    session_id: str
    result: Literal["clear", "consider", "unidentified"]
    face_match: bool
    similarity_score: float
    liveness_passed: bool
    source: Literal["onfido", "rekognition", "fallback"]
    onfido_report_id: Optional[str] = None
    breakdown: Optional[dict] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Health probe response payload."""

    status: str
    service: str = "biometric"
    version: str = "0.1.0"
