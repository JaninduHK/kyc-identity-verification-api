"""Pydantic v2 models for the Kestrel Document Service."""
from typing import Optional

from pydantic import BaseModel, Field


class DocumentCheckRequest(BaseModel):
    """Request payload for an internal document check."""

    nicImageBase64: str
    sessionId: str


class DocumentCheckResult(BaseModel):
    """Result of a document verification check."""

    onfido_report_id: Optional[str] = None
    result: str
    sub_result: Optional[str] = None
    extracted_name: Optional[str] = None
    extracted_dob: Optional[str] = None
    extracted_nic: Optional[str] = None
    document_type: Optional[str] = None
    issuing_country: Optional[str] = None
    image_integrity: dict = Field(default_factory=dict)
    visual_authenticity: dict = Field(default_factory=dict)
    confidence: float = 0.0
