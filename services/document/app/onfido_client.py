"""Onfido client for document verification with a targeted OCR fallback.

Onfido is the primary provider. The OCR fallback (Tesseract) is used only when
Onfido is genuinely *unavailable* (network/timeout/5xx) — not for auth or
request errors, which indicate misconfiguration and must surface as an error
rather than silently degrading every request to low-confidence OCR.
"""
import asyncio
import base64
import logging
from typing import Any, Dict, Optional

import httpx

from app.config import settings
from app.models import DocumentCheckResult

logger = logging.getLogger("kestrel.document.onfido")

_HEADERS = {"Authorization": f"Token token={settings.onfido_api_token}"}
_POLL_INTERVAL_SECONDS = 2
_POLL_MAX_ATTEMPTS = 15


def _error_result(error: str) -> DocumentCheckResult:
    """Build a failed result (status=error) without any OCR degradation."""
    return DocumentCheckResult(
        status="error",
        result="unidentified",
        confidence=0.0,
        error=error,
    )


def _build_result_from_report(
    report: Dict[str, Any],
    applicant_id: Optional[str],
    document_id: Optional[str],
) -> DocumentCheckResult:
    """Build a DocumentCheckResult from a completed Onfido report payload."""
    properties: Dict[str, Any] = report.get("properties") or {}
    breakdown: Dict[str, Any] = report.get("breakdown") or {}

    first_name = properties.get("first_name")
    last_name = properties.get("last_name")
    extracted_name = None
    if first_name or last_name:
        extracted_name = " ".join(
            part for part in [first_name, last_name] if part
        ).strip() or None

    document_numbers = properties.get("document_numbers") or []
    extracted_nic = None
    if isinstance(document_numbers, list) and document_numbers:
        first_num = document_numbers[0]
        if isinstance(first_num, dict):
            extracted_nic = first_num.get("value")
        else:
            extracted_nic = first_num

    return DocumentCheckResult(
        status="completed",
        onfido_report_id=report.get("id"),
        result=report.get("result", "unidentified"),
        sub_result=report.get("sub_result"),
        extracted_name=extracted_name,
        extracted_dob=properties.get("date_of_birth"),
        extracted_nic=extracted_nic,
        document_type=properties.get("document_type"),
        issuing_country=properties.get("issuing_country"),
        applicant_id=applicant_id,
        document_id=document_id,
        image_integrity=breakdown.get("image_integrity") or {},
        visual_authenticity=breakdown.get("visual_authenticity") or {},
        confidence=1.0 if report.get("result") == "clear" else 0.5,
    )


def _ocr_fallback_result(nic_image_b64: str, session_id: str) -> DocumentCheckResult:
    """Run the Tesseract OCR fallback and build a degraded result."""
    logger.warning(
        "Falling back to OCR for session %s (Onfido unavailable)", session_id
    )
    # Lazy import so app.main import does not pull in cv2/numpy/pytesseract.
    from app.ocr_fallback import extract_nic_tesseract

    ocr = extract_nic_tesseract(nic_image_b64)
    return DocumentCheckResult(
        status="completed",
        result="unidentified",
        sub_result="ocr_fallback",
        extracted_nic=ocr.get("nic"),
        document_type="national_identity_card",
        issuing_country="LKA",
        confidence=0.2 if ocr.get("nic") else 0.0,
    )


async def check_document(
    nic_image_b64: str, session_id: str
) -> DocumentCheckResult:
    """Run an Onfido document check.

    Falls back to OCR only when Onfido is unavailable (network/timeout/5xx).
    Auth/request errors and bad input surface as an error result instead.
    """
    try:
        image_bytes = base64.b64decode(nic_image_b64)
    except (ValueError, TypeError) as e:
        logger.error("Invalid base64 image for session %s: %s", session_id, e)
        return _error_result("invalid_image_base64")

    try:
        async with httpx.AsyncClient(
            base_url=settings.onfido_base_url,
            headers=_HEADERS,
            timeout=30.0,
        ) as client:
            # 1) Create applicant.
            applicant_resp = await client.post(
                "/applicants",
                json={"first_name": "Kestrel", "last_name": "Applicant"},
            )
            applicant_resp.raise_for_status()
            applicant_id = applicant_resp.json()["id"]

            # 2) Upload document.
            doc_resp = await client.post(
                "/documents",
                data={
                    "type": "national_identity_card",
                    "applicant_id": applicant_id,
                },
                files={"file": ("nic.jpg", image_bytes, "image/jpeg")},
            )
            doc_resp.raise_for_status()
            document_id = doc_resp.json()["id"]

            # 3) Create check.
            check_resp = await client.post(
                "/checks",
                json={
                    "applicant_id": applicant_id,
                    "report_names": ["document"],
                    "document_ids": [document_id],
                },
            )
            check_resp.raise_for_status()
            report_ids = check_resp.json().get("report_ids") or []
            if not report_ids:
                logger.error(
                    "Onfido check returned no report_ids for session %s", session_id
                )
                return _error_result("onfido_no_report_id")
            report_id = report_ids[0]

            # 4) Poll the report until complete.
            report: Dict[str, Any] = {}
            completed = False
            for _ in range(_POLL_MAX_ATTEMPTS):
                report_resp = await client.get(f"/reports/{report_id}")
                report_resp.raise_for_status()
                report = report_resp.json()
                if report.get("status") == "complete":
                    completed = True
                    break
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            if not completed:
                logger.warning(
                    "Onfido report polling timed out for session %s", session_id
                )
                return _error_result("onfido_timeout")

            # 5) Build the result.
            return _build_result_from_report(report, applicant_id, document_id)

    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code if e.response is not None else None
        if status_code in (401, 403):
            # Misconfiguration — do NOT degrade to OCR; surface the error.
            logger.error(
                "Onfido auth failed (%s) for session %s", status_code, session_id
            )
            return _error_result("onfido_auth_failed")
        if status_code is not None and 400 <= status_code < 500:
            logger.error(
                "Onfido request error (%s) for session %s", status_code, session_id
            )
            return _error_result(f"onfido_request_error_{status_code}")
        # 5xx — Onfido is unavailable; fall back to OCR.
        return _ocr_fallback_result(nic_image_b64, session_id)
    except (httpx.TimeoutException, httpx.TransportError) as e:
        logger.warning(
            "Onfido transport error for session %s (%s); using OCR fallback",
            session_id,
            e,
        )
        return _ocr_fallback_result(nic_image_b64, session_id)
