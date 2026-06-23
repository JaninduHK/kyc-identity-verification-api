"""Pydantic v2 models for the Kestrel Biometric Service."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class BiometricCheckRequest(BaseModel):
    """Request payload for an internal biometric check."""

    applicant_id: str = Field(..., description="Onfido applicant ID from document service")
    selfie_base64: str = Field(..., description="base64 encoded JPEG/PNG selfie")
    document_id: str = Field(..., description="Onfido document ID from document service")
    session_id: str = Field(..., description="for logging and tracing")


class BiometricCheckResult(BaseModel):
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
