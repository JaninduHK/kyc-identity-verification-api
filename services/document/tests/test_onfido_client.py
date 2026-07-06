"""Tests for the Onfido document client and its targeted OCR fallback."""
import httpx
import pytest

from app.onfido_client import check_document
from tests.conftest import make_response, mock_async_client


def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://api.eu.onfido.com/v3.6/applicants")
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError(str(status_code), request=request, response=response)


@pytest.mark.asyncio
async def test_clear_check_returns_ids_and_extracted_fields(
    mocker, tiny_jpeg_b64, onfido_clear_report
) -> None:
    mock_async_client(
        mocker,
        post_side_effect=[
            make_response({"id": "applicant-1"}),
            make_response({"id": "doc-1"}),
            make_response({"report_ids": ["report-1"]}),
        ],
        get_return=make_response(onfido_clear_report),
    )

    result = await check_document(tiny_jpeg_b64, "sess-1")

    assert result.status == "completed"
    assert result.result == "clear"
    assert result.applicant_id == "applicant-1"
    assert result.document_id == "doc-1"
    assert result.extracted_name == "Nimal Perera"
    assert result.extracted_nic == "199012345678"
    assert result.confidence == 1.0


@pytest.mark.asyncio
async def test_camelcase_serialization(mocker, tiny_jpeg_b64, onfido_clear_report) -> None:
    """The response serialises to camelCase for the orchestrator."""
    mock_async_client(
        mocker,
        post_side_effect=[
            make_response({"id": "applicant-1"}),
            make_response({"id": "doc-1"}),
            make_response({"report_ids": ["report-1"]}),
        ],
        get_return=make_response(onfido_clear_report),
    )

    result = await check_document(tiny_jpeg_b64, "sess-1")
    body = result.model_dump(by_alias=True)

    assert body["applicantId"] == "applicant-1"
    assert body["documentId"] == "doc-1"
    assert body["extractedName"] == "Nimal Perera"
    assert body["subResult"] == "clear"


@pytest.mark.asyncio
async def test_auth_failure_does_not_fall_back_to_ocr(mocker, tiny_jpeg_b64) -> None:
    """A 401 is a misconfiguration and must surface as an error, not OCR."""
    ocr = mocker.patch("app.ocr_fallback.extract_nic_tesseract")
    mock_async_client(mocker, post_side_effect=_http_status_error(401))

    result = await check_document(tiny_jpeg_b64, "sess-1")

    assert result.status == "error"
    assert result.error == "onfido_auth_failed"
    ocr.assert_not_called()


@pytest.mark.asyncio
async def test_5xx_falls_back_to_ocr(mocker, tiny_jpeg_b64) -> None:
    """A 5xx means Onfido is unavailable → OCR fallback runs."""
    ocr = mocker.patch(
        "app.ocr_fallback.extract_nic_tesseract",
        return_value={"nic": "991234567V", "method": "tesseract"},
    )
    mock_async_client(mocker, post_side_effect=_http_status_error(503))

    result = await check_document(tiny_jpeg_b64, "sess-1")

    assert result.status == "completed"
    assert result.sub_result == "ocr_fallback"
    assert result.extracted_nic == "991234567V"
    assert result.confidence == 0.2
    ocr.assert_called_once()


@pytest.mark.asyncio
async def test_timeout_falls_back_to_ocr(mocker, tiny_jpeg_b64) -> None:
    ocr = mocker.patch(
        "app.ocr_fallback.extract_nic_tesseract",
        return_value={"nic": None, "method": "tesseract"},
    )
    mock_async_client(
        mocker, post_side_effect=httpx.TimeoutException("timed out")
    )

    result = await check_document(tiny_jpeg_b64, "sess-1")

    assert result.status == "completed"
    assert result.sub_result == "ocr_fallback"
    assert result.confidence == 0.0
    ocr.assert_called_once()


@pytest.mark.asyncio
async def test_polling_timeout_returns_error(mocker, tiny_jpeg_b64) -> None:
    """A report that never completes is an error, not a fake 0.5 result."""
    processing = make_response({"id": "report-1", "status": "processing"})
    mock_async_client(
        mocker,
        post_side_effect=[
            make_response({"id": "applicant-1"}),
            make_response({"id": "doc-1"}),
            make_response({"report_ids": ["report-1"]}),
        ],
        get_return=processing,
    )
    mocker.patch("app.onfido_client.asyncio.sleep", new=mocker.AsyncMock())

    result = await check_document(tiny_jpeg_b64, "sess-1")

    assert result.status == "error"
    assert result.error == "onfido_timeout"


@pytest.mark.asyncio
async def test_invalid_base64_returns_error(mocker) -> None:
    result = await check_document("!!!not-base64!!!", "sess-1")
    assert result.status == "error"
    assert result.error == "invalid_image_base64"
