"""Tests for the Onfido biometric client."""
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.onfido_biometric import run_biometric_check


def _make_response(json_data: dict) -> MagicMock:
    """Build a mock httpx.Response with sync json()/raise_for_status()."""
    resp = MagicMock()
    resp.json.return_value = json_data
    resp.raise_for_status.return_value = None
    return resp


def _mock_async_client(mocker, *, post_side_effect, get_return=None, get_side_effect=None):
    """Patch httpx.AsyncClient and return the underlying client mock."""
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    client.post = AsyncMock(side_effect=post_side_effect)
    if get_side_effect is not None:
        client.get = AsyncMock(side_effect=get_side_effect)
    else:
        client.get = AsyncMock(return_value=get_return)
    mocker.patch(
        "app.onfido_biometric.httpx.AsyncClient", return_value=client
    )
    return client


@pytest.mark.asyncio
async def test_successful_clear_check(
    mocker, sample_request, settings, mock_onfido_clear_response
) -> None:
    """A clear report yields a clear, matching, live result from Onfido."""
    photo_resp = _make_response({"id": "photo-123"})
    check_resp = _make_response({"report_ids": ["report-123"]})
    report_resp = _make_response(mock_onfido_clear_response)
    _mock_async_client(
        mocker,
        post_side_effect=[photo_resp, check_resp],
        get_return=report_resp,
    )

    result = await run_biometric_check(sample_request, settings)

    assert result.result == "clear"
    assert result.face_match is True
    assert result.similarity_score == 0.95
    assert result.liveness_passed is True
    assert result.source == "onfido"


@pytest.mark.asyncio
async def test_consider_result(
    mocker, sample_request, settings, mock_onfido_consider_response
) -> None:
    """A consider report yields a non-matching result."""
    photo_resp = _make_response({"id": "photo-123"})
    check_resp = _make_response({"report_ids": ["report-123"]})
    report_resp = _make_response(mock_onfido_consider_response)
    _mock_async_client(
        mocker,
        post_side_effect=[photo_resp, check_resp],
        get_return=report_resp,
    )

    result = await run_biometric_check(sample_request, settings)

    assert result.result == "consider"
    assert result.face_match is False


@pytest.mark.asyncio
async def test_timeout_handling(mocker, sample_request, settings) -> None:
    """An httpx timeout is reported as onfido_timeout / unidentified."""
    _mock_async_client(
        mocker,
        post_side_effect=httpx.TimeoutException("timed out"),
    )

    result = await run_biometric_check(sample_request, settings)

    assert result.error == "onfido_timeout"
    assert result.result == "unidentified"


@pytest.mark.asyncio
async def test_auth_failure(mocker, sample_request, settings) -> None:
    """A 401 status error is reported as onfido_auth_failed."""
    request = httpx.Request("POST", "https://api.eu.onfido.com/v3.6/live_photos")
    response = httpx.Response(401, request=request)
    error = httpx.HTTPStatusError("401", request=request, response=response)
    _mock_async_client(mocker, post_side_effect=error)

    result = await run_biometric_check(sample_request, settings)

    assert result.error == "onfido_auth_failed"


@pytest.mark.asyncio
async def test_polling_timeout(mocker, sample_request, settings) -> None:
    """A report that never completes is reported with error=timeout."""
    photo_resp = _make_response({"id": "photo-123"})
    check_resp = _make_response({"report_ids": ["report-123"]})
    processing_resp = _make_response({"id": "report-123", "status": "processing"})
    _mock_async_client(
        mocker,
        post_side_effect=[photo_resp, check_resp],
        get_return=processing_resp,
    )
    # Avoid real 2s sleeps between the 25 polling attempts.
    mocker.patch("app.onfido_biometric.asyncio.sleep", new=AsyncMock())

    result = await run_biometric_check(sample_request, settings)

    assert result.error == "timeout"
    assert result.result == "unidentified"
