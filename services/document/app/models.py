"""Pydantic v2 models for the Kestrel Document Service.

The response model uses a camelCase alias generator with ``populate_by_name``
so it interoperates with the Node/TS orchestrator (which reads camelCase:
``subResult``, ``extractedName``, ``applicantId``…) while still accepting
snake_case field names from the Python code that constructs it. FastAPI
serialises by alias, so the orchestrator receives camelCase.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class DocumentCheckRequest(BaseModel):
    """Request payload for an internal document check."""

    nicImageBase64: str
    sessionId: str


class DocumentCheckResult(BaseModel):
    """Result of a document verification check."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: str = "completed"
    result: str
    sub_result: Optional[str] = None
    extracted_name: Optional[str] = None
    extracted_dob: Optional[str] = None
    extracted_nic: Optional[str] = None
    document_type: Optional[str] = None
    issuing_country: Optional[str] = None
    # Onfido identifiers, needed by the biometric service to run the
    # facial-similarity check against the same applicant/document.
    applicant_id: Optional[str] = None
    document_id: Optional[str] = None
    onfido_report_id: Optional[str] = None
    image_integrity: dict = Field(default_factory=dict)
    visual_authenticity: dict = Field(default_factory=dict)
    confidence: float = 0.0
    error: Optional[str] = None
