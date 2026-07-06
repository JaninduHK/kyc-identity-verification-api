"""Shared pytest fixtures for the biometric service tests."""
import pytest

from app.config import Settings
from app.models import BiometricCheckRequest

# A small but valid 1x1 pixel JPEG, base64 encoded.
_TINY_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=="
)


@pytest.fixture
def settings() -> Settings:
    """Return a Settings instance populated with test values."""
    return Settings(
        ONFIDO_API_TOKEN="api_sandbox.test_token",
        ONFIDO_BASE_URL="https://api.eu.onfido.com/v3.6",
        AWS_REGION="ap-south-1",
        REKOGNITION_ENABLED=False,
    )


@pytest.fixture
def settings_rekognition() -> Settings:
    """Return a Settings instance with the Rekognition fallback enabled."""
    return Settings(
        ONFIDO_API_TOKEN="api_sandbox.test_token",
        ONFIDO_BASE_URL="https://api.eu.onfido.com/v3.6",
        AWS_REGION="ap-south-1",
        REKOGNITION_ENABLED=True,
    )


@pytest.fixture
def sample_request() -> BiometricCheckRequest:
    """Return a valid BiometricCheckRequest with a tiny JPEG selfie."""
    return BiometricCheckRequest(
        applicant_id="test-applicant-123",
        selfie_base64=_TINY_JPEG_BASE64,
        document_id="test-doc-456",
        session_id="test-session-789",
    )


@pytest.fixture
def sample_request_with_doc() -> BiometricCheckRequest:
    """Return a request that also carries a document face photo."""
    return BiometricCheckRequest(
        applicant_id="test-applicant-123",
        selfie_base64=_TINY_JPEG_BASE64,
        document_id="test-doc-456",
        session_id="test-session-789",
        doc_photo_base64=_TINY_JPEG_BASE64,
    )


@pytest.fixture
def mock_onfido_clear_response() -> dict:
    """Onfido report payload for a clear facial similarity result."""
    return {
        "id": "report-abc-123",
        "status": "complete",
        "result": "clear",
        "breakdown": {
            "face_comparison": {
                "result": "clear",
                "properties": {"score": 0.95},
            },
            "image_integrity": {"result": "clear"},
        },
    }


@pytest.fixture
def mock_onfido_consider_response() -> dict:
    """Onfido report payload for a consider facial similarity result."""
    return {
        "id": "report-abc-456",
        "status": "complete",
        "result": "consider",
        "breakdown": {
            "face_comparison": {
                "result": "consider",
                "properties": {"score": 0.45},
            },
            "image_integrity": {"result": "consider"},
        },
    }
