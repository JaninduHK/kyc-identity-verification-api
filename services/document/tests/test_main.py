"""Tests for the document service FastAPI endpoints."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["service"] == "document"


def test_ready_endpoint() -> None:
    resp = client.get("/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_check_missing_fields_returns_422() -> None:
    resp = client.post("/internal/check", json={})
    assert resp.status_code == 422


def test_check_missing_session_id_returns_422() -> None:
    resp = client.post("/internal/check", json={"nicImageBase64": "abc"})
    assert resp.status_code == 422
