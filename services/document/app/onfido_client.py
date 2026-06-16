"""Onfido client for document verification with OCR fallback."""
import asyncio
import base64
import logging
from typing import Any, Dict

import httpx

from app.config import settings
from app.models import DocumentCheckResult

logger = logging.getLogger("kestrel.document.onfido")

_HEADERS = {"Authorization": f"Token token={settings.onfido_api_token}"}
_POLL_INTERVAL_SECONDS = 2
_POLL_MAX_ATTEMPTS = 15


def _build_result_from_report(report: Dict[str, Any]) -> DocumentCheckResult:
    """Build a DocumentCheckResult from an Onfido report payload."""
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
        onfido_report_id=report.get("id"),
        result=report.get("result", "unidentified"),
        sub_result=report.get("sub_result"),
        extracted_name=extracted_name,
        extracted_dob=properties.get("date_of_birth"),
        extracted_nic=extracted_nic,
        document_type=properties.get("document_type"),
        issuing_country=properties.get("issuing_country"),
        image_integrity=breakdown.get("image_integrity") or {},
        visual_authenticity=breakdown.get("visual_authenticity") or {},
        confidence=1.0 if report.get("result") == "clear" else 0.5,
    )


async def check_document(
    nic_image_b64: str, session_id: str
) -> DocumentCheckResult:
    """Run an Onfido document check, falling back to OCR on any failure."""
    try:
        image_bytes = base64.b64decode(nic_image_b64)

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
            check_data = check_resp.json()
            report_ids = check_data.get("report_ids") or []
            if not report_ids:
                raise ValueError("No report_ids returned from Onfido check")
            report_id = report_ids[0]

            # 4) Poll the report until complete.
            report: Dict[str, Any] = {}
            for _ in range(_POLL_MAX_ATTEMPTS):
                report_resp = await client.get(f"/reports/{report_id}")
                report_resp.raise_for_status()
                report = report_resp.json()
                if report.get("status") == "complete":
                    break
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            # 5) Build the result.
            return _build_result_from_report(report)
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "Onfido document check failed for session %s, falling back to OCR: %s",
            session_id,
            e,
        )
        # Lazy import so app.main import does not pull in cv2/numpy/pytesseract.
        from app.ocr_fallback import extract_nic_tesseract

        ocr = extract_nic_tesseract(nic_image_b64)
        return DocumentCheckResult(
            result="unidentified",
            extracted_nic=ocr.get("nic"),
            document_type="national_identity_card",
            issuing_country="LKA",
            confidence=0.2 if ocr.get("nic") else 0.0,
        )
