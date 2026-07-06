"""Tests for the risk service FastAPI endpoints."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["service"] == "risk"


def test_ready() -> None:
    assert client.get("/ready").json()["status"] == "ready"


def test_score_endpoint() -> None:
    resp = client.post(
        "/internal/score",
        json={
            "sessionId": "s1",
            "document": {"result": "consider"},
            "biometric": {},
            "aml": {},
            "ip": {},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 60.0
    assert "document_result_consider" in body["factors"]


def test_ip_endpoint_datacenter() -> None:
    resp = client.post("/internal/ip", json={"sessionId": "s1", "ipAddress": "8.8.8.8"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["isProxy"] is True
    assert body["ipRiskScore"] == 80.0
    assert body["provider"] == "rule-based"


def test_ip_endpoint_no_ip() -> None:
    resp = client.post("/internal/ip", json={"sessionId": "s1"})
    assert resp.status_code == 200
    assert resp.json()["ipRiskScore"] == 0.0
