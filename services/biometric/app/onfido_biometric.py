"""Onfido client for biometric (facial similarity) verification."""
import asyncio
import base64
import logging
from typing import Any, Dict, Optional

import httpx

from app.config import settings
from app.models import BiometricCheckResult

logger = logging.getLogger("kestrel.biometric.onfido")

_HEADERS = {"Authorization": f"Token token={settings.onfido_api_token}"}
_POLL_INTERVAL_SECONDS = 2
_POLL_MAX_ATTEMPTS = 15


def _build_result_from_report(report: Dict[str, Any]) -> BiometricCheckResult:
    """Build a BiometricCheckResult from an Onfido report payload."""
    result = report.get("result", "error")
    properties: Dict[str, Any] = report.get("properties") or {}
    breakdown: Dict[str, Any] = report.get("breakdown") or {}

    similarity_score = 0.0
    raw_score = properties.get("score")
    if raw_score is None:
        face_comparison = breakdown.get("face_comparison") or {}
        raw_score = face_comparison.get("score")
    if raw_score is not None:
        try:
            similarity_score = float(raw_score)
        except (TypeError, ValueError):
            similarity_score = 0.0

    liveness_passed = False
    image_integrity = breakdown.get("image_integrity") or {}
    if image_integrity.get("result") == "clear":
        liveness_passed = True

    return BiometricCheckResult(
        result=result,
        face_match=result == "clear",
        similarity_score=similarity_score,
        liveness_passed=liveness_passed,
        source="onfido",
    )


async def run_biometric_check(
    applicant_id: Optional[str],
    selfie_b64: str,
    document_id: Optional[str],
) -> BiometricCheckResult:
    """Run an Onfido facial similarity check."""
    try:
        selfie_bytes = base64.b64decode(selfie_b64)

        async with httpx.AsyncClient(
            base_url=settings.onfido_base_url,
            headers=_HEADERS,
            timeout=30.0,
        ) as client:
            # 1) Upload the live photo.
            photo_resp = await client.post(
                "/live_photos",
                data={"applicant_id": applicant_id},
                files={"file": ("selfie.jpg", selfie_bytes, "image/jpeg")},
            )
            photo_resp.raise_for_status()

            # 2) Create the facial similarity check.
            check_resp = await client.post(
                "/checks",
                json={
                    "applicant_id": applicant_id,
                    "report_names": ["facial_similarity_photo"],
                },
            )
            check_resp.raise_for_status()
            check_data = check_resp.json()
            report_ids = check_data.get("report_ids") or []
            if not report_ids:
                raise ValueError("No report_ids returned from Onfido check")
            report_id = report_ids[0]

            # 3) Poll the report until complete.
            report: Dict[str, Any] = {}
            for _ in range(_POLL_MAX_ATTEMPTS):
                report_resp = await client.get(f"/reports/{report_id}")
                report_resp.raise_for_status()
                report = report_resp.json()
                if report.get("status") == "complete":
                    break
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            # 4) Build the result.
            return _build_result_from_report(report)
    except Exception as e:  # noqa: BLE001
        logger.warning("Onfido biometric check failed: %s", e)
        return BiometricCheckResult(result="error", source="onfido")
