"""Tests for the router: Onfido -> Rekognition fallback wiring and contract.

These exercise the parts that make the service usable end-to-end: the fallback
is only a live path when it is enabled *and* a document photo is supplied, and
the request/response speak the orchestrator's camelCase over the wire.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.models import BiometricCheckResult
from app.router import internal_check


def _onfido_error(session_id: str) -> BiometricCheckResult:
    """A failed Onfido result (source=onfido, error set)."""
    return BiometricCheckResult(
        session_id=session_id,
        result="unidentified",
        face_match=False,
        similarity_score=0.0,
        liveness_passed=False,
        source="onfido",
        error="onfido_timeout",
    )


def _rekognition_clear(session_id: str) -> BiometricCheckResult:
    """A successful Rekognition fallback result."""
    return BiometricCheckResult(
        session_id=session_id,
        result="clear",
        face_match=True,
        similarity_score=0.92,
        liveness_passed=False,
        source="rekognition",
    )


@pytest.mark.asyncio
async def test_fallback_used_when_enabled_and_doc_photo(
    mocker, sample_request_with_doc, settings_rekognition
) -> None:
    """Onfido error + fallback enabled + doc photo -> Rekognition result."""
    mocker.patch(
        "app.router.run_biometric_check",
        new=AsyncMock(return_value=_onfido_error(sample_request_with_doc.session_id)),
    )
    rek = mocker.patch(
        "app.router.rekognition_face_match",
        new=MagicMock(return_value=_rekognition_clear(sample_request_with_doc.session_id)),
    )

    result = await internal_check(sample_request_with_doc, settings_rekognition)

    rek.assert_called_once()
    assert result.source == "rekognition"
    assert result.face_match is True
    assert result.error is None


@pytest.mark.asyncio
async def test_fallback_skipped_without_doc_photo(
    mocker, sample_request, settings_rekognition
) -> None:
    """Onfido error + fallback enabled but no doc photo -> Onfido error kept."""
    mocker.patch(
        "app.router.run_biometric_check",
        new=AsyncMock(return_value=_onfido_error(sample_request.session_id)),
    )
    rek = mocker.patch("app.router.rekognition_face_match", new=MagicMock())

    result = await internal_check(sample_request, settings_rekognition)

    rek.assert_not_called()
    assert result.source == "onfido"
    assert result.error == "onfido_timeout"


@pytest.mark.asyncio
async def test_fallback_not_used_when_disabled(
    mocker, sample_request_with_doc, settings
) -> None:
    """Fallback disabled -> Rekognition never runs even with a doc photo."""
    mocker.patch(
        "app.router.run_biometric_check",
        new=AsyncMock(return_value=_onfido_error(sample_request_with_doc.session_id)),
    )
    rek = mocker.patch("app.router.rekognition_face_match", new=MagicMock())

    result = await internal_check(sample_request_with_doc, settings)

    rek.assert_not_called()
    assert result.source == "onfido"


@pytest.mark.asyncio
async def test_fallback_not_used_on_onfido_success(
    mocker, sample_request_with_doc, settings_rekognition
) -> None:
    """A clean Onfido result short-circuits the fallback."""
    ok = BiometricCheckResult(
        session_id=sample_request_with_doc.session_id,
        result="clear",
        face_match=True,
        similarity_score=0.95,
        liveness_passed=True,
        source="onfido",
    )
    mocker.patch("app.router.run_biometric_check", new=AsyncMock(return_value=ok))
    rek = mocker.patch("app.router.rekognition_face_match", new=MagicMock())

    result = await internal_check(sample_request_with_doc, settings_rekognition)

    rek.assert_not_called()
    assert result.source == "onfido"


def test_ready_endpoint() -> None:
    """GET /ready returns 200 with status ready."""
    client = TestClient(app)
    resp = client.get("/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_check_accepts_camelcase_and_returns_camelcase(mocker) -> None:
    """The orchestrator's camelCase body is accepted; response is camelCase."""
    mocker.patch(
        "app.router.run_biometric_check",
        new=AsyncMock(return_value=_rekognition_clear("sess-camel")),
    )
    client = TestClient(app)
    resp = client.post(
        "/internal/check",
        json={
            "applicantId": "app-1",
            "selfieBase64": "c2VsZmll",
            "documentId": "doc-1",
            "sessionId": "sess-camel",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    # Response serialises by alias so the orchestrator can read it.
    assert body["faceMatch"] is True
    assert body["similarityScore"] == 0.92
    assert body["livenessPassed"] is False
    assert body["sessionId"] == "sess-camel"


def test_check_camelcase_fallback_wired_via_http(mocker) -> None:
    """End-to-end over HTTP: camelCase docPhotoBase64 drives the fallback."""
    app.dependency_overrides[get_settings] = lambda: Settings(
        ONFIDO_API_TOKEN="x", REKOGNITION_ENABLED=True
    )
    try:
        mocker.patch(
            "app.router.run_biometric_check",
            new=AsyncMock(return_value=_onfido_error("sess-fb")),
        )
        rek = mocker.patch(
            "app.router.rekognition_face_match",
            new=MagicMock(return_value=_rekognition_clear("sess-fb")),
        )
        client = TestClient(app)
        resp = client.post(
            "/internal/check",
            json={
                "applicantId": "app-1",
                "selfieBase64": "c2VsZmll",
                "documentId": "doc-1",
                "sessionId": "sess-fb",
                "docPhotoBase64": "ZG9j",
            },
        )
        assert resp.status_code == 200
        rek.assert_called_once()
        assert resp.json()["source"] == "rekognition"
    finally:
        app.dependency_overrides.clear()
