"""Pydantic v2 request/response models for the Risk Service."""

from pydantic import BaseModel, Field


class RiskScoreRequest(BaseModel):
    """Inbound payload describing the results of upstream KYC checks."""

    sessionId: str
    document: dict = Field(default_factory=dict)
    biometric: dict = Field(default_factory=dict)
    aml: dict = Field(default_factory=dict)
    ip: dict = Field(default_factory=dict)


class RiskScoreResult(BaseModel):
    """Computed risk score and the factors that contributed to it."""

    score: float
    factors: list[str]
