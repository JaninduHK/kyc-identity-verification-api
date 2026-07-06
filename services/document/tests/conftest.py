"""Shared pytest fixtures for the document service tests."""
from unittest.mock import AsyncMock, MagicMock

import pytest

# A small but valid 1x1 pixel JPEG, base64 encoded.
_TINY_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=="
)


@pytest.fixture
def tiny_jpeg_b64() -> str:
    return _TINY_JPEG_BASE64


@pytest.fixture
def onfido_clear_report() -> dict:
    """A completed Onfido document report with a clear result."""
    return {
        "id": "report-1",
        "status": "complete",
        "result": "clear",
        "sub_result": "clear",
        "properties": {
            "first_name": "Nimal",
            "last_name": "Perera",
            "date_of_birth": "1990-05-01",
            "document_numbers": [{"value": "199012345678"}],
            "document_type": "national_identity_card",
            "issuing_country": "LKA",
        },
        "breakdown": {
            "image_integrity": {"result": "clear"},
            "visual_authenticity": {"result": "clear"},
        },
    }


def make_response(json_data: dict) -> MagicMock:
    """Build a mock httpx.Response with sync json()/raise_for_status()."""
    resp = MagicMock()
    resp.json.return_value = json_data
    resp.raise_for_status.return_value = None
    return resp


def mock_async_client(mocker, *, post_side_effect, get_return=None, get_side_effect=None):
    """Patch httpx.AsyncClient in onfido_client and return the client mock."""
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    client.post = AsyncMock(side_effect=post_side_effect)
    if get_side_effect is not None:
        client.get = AsyncMock(side_effect=get_side_effect)
    else:
        client.get = AsyncMock(return_value=get_return)
    mocker.patch("app.onfido_client.httpx.AsyncClient", return_value=client)
    return client
