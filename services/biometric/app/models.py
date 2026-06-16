"""Pydantic v2 models for the Kestrel Biometric Service."""
from typing import Optional

from pydantic import BaseModel


class BiometricCheckRequest(BaseModel):
    """Request payload for an internal biometric check."""

    applicant_id: Optional[str] = None
    selfie_base64: str
    document_id: Optional[str] = None
    session_id: str


class BiometricCheckResult(BaseModel):
    """Result of a biometric (facial similarity / liveness) check."""

    result: str
    face_match: bool = False
    similarity_score: float = 0.0
    liveness_passed: bool = False
    source: str = "onfido"
