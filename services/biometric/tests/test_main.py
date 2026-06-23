"""Tests for the FastAPI endpoints."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    """GET /health returns 200 with status ok and service biometric."""
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "biometric"


def test_health_response_schema() -> None:
    """Health response contains status, service and version fields."""
    body = client.get("/health").json()
    assert "status" in body
    assert "service" in body
    assert "version" in body


def test_check_endpoint_missing_fields() -> None:
    """POST /internal/check with an empty body returns 422."""
    resp = client.post("/internal/check", json={})
    assert resp.status_code == 422


def test_check_endpoint_missing_applicant_id() -> None:
    """POST /internal/check without applicant_id returns 422."""
    resp = client.post(
        "/internal/check",
        json={
            "selfie_base64": "abc",
            "document_id": "doc-1",
            "session_id": "sess-1",
        },
    )
    assert resp.status_code == 422


def test_check_endpoint_missing_selfie() -> None:
    """POST /internal/check without selfie_base64 returns 422."""
    resp = client.post(
        "/internal/check",
        json={
            "applicant_id": "app-1",
            "document_id": "doc-1",
            "session_id": "sess-1",
        },
    )
    assert resp.status_code == 422
