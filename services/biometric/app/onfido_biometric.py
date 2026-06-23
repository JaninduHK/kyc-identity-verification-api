"""Onfido client for biometric (facial similarity + liveness) verification.

Onfido is the *primary* provider. The flow is:

1. Upload the selfie as a live photo against the existing applicant.
2. Create a ``facial_similarity_photo`` check referencing the document.
3. Poll the resulting report until it completes.
4. Parse the report into a :class:`BiometricCheckResult`.

``run_biometric_check`` never raises — every failure path is captured in the
``error`` field of the returned result so the orchestrator always receives a
well-formed response.
"""
import asyncio
import base64
import logging
import traceback
from typing import Any, Dict

import httpx

from app.config import Settings
from app.models import BiometricCheckRequest, BiometricCheckResult

logger = logging.getLogger("kestrel.biometric.onfido")

_CLIENT_TIMEOUT_SECONDS = 50.0
_POLL_INTERVAL_SECONDS = 2
_POLL_MAX_ATTEMPTS = 25


def _error_result(
    session_id: str,
    error: str,
    result: str = "unidentified",
) -> BiometricCheckResult:
    """Build a failed :class:`BiometricCheckResult` with an error message."""
    return BiometricCheckResult(
        session_id=session_id,
        result=result,  # type: ignore[arg-type]
        face_match=False,
        similarity_score=0.0,
        liveness_passed=False,
        source="onfido",
        onfido_report_id=None,
        breakdown=None,
        error=error,
    )


def _parse_report(report: Dict[str, Any], session_id: str) -> BiometricCheckResult:
    """Build a :class:`BiometricCheckResult` from a completed Onfido report."""
    result = report.get("result", "unidentified")
    if result not in ("clear", "consider", "unidentified"):
        result = "unidentified"
    face_match = result == "clear"
    breakdown: Dict[str, Any] = report.get("breakdown", {}) or {}

    # similarity_score lives at breakdown.face_comparison.properties.score.
    try:
        similarity_score = float(
            breakdown["face_comparison"]["properties"]["score"]
        )
    except (KeyError, TypeError, ValueError):
        similarity_score = 0.0

    liveness_passed = (
        breakdown.get("image_integrity", {}).get("result") == "clear"
    )

    return BiometricCheckResult(
        session_id=session_id,
        result=result,  # type: ignore[arg-type]
        face_match=face_match,
        similarity_score=similarity_score,
        liveness_passed=liveness_passed,
        source="onfido",
        onfido_report_id=report.get("id"),
        breakdown=breakdown,
        error=None,
    )


async def run_biometric_check(
    request: BiometricCheckRequest,
    settings: Settings,
) -> BiometricCheckResult:
    """Run an Onfido facial-similarity + liveness check.

    Always returns a :class:`BiometricCheckResult`; never raises.
    """
    session_id = request.session_id
    logger.info("Onfido biometric check entry: session=%s", session_id)

    auth_header = {"Authorization": f"Token token={settings.ONFIDO_API_TOKEN}"}

    try:
        selfie_bytes = base64.b64decode(request.selfie_base64)

        async with httpx.AsyncClient(
            base_url=settings.ONFIDO_BASE_URL,
            timeout=_CLIENT_TIMEOUT_SECONDS,
        ) as client:
            # 1) Upload the selfie as a live photo. The Authorization header is
            #    set on this request directly (httpx multipart requires it set
            #    here rather than relying on default client headers).
            photo_resp = await client.post(
                "/live_photos",
                data={"applicant_id": request.applicant_id},
                files={"file": ("selfie.jpg", selfie_bytes, "image/jpeg")},
                headers=auth_header,
            )
            photo_resp.raise_for_status()
            photo_id = photo_resp.json().get("id")
            logger.info(
                "Onfido live photo uploaded: session=%s photo_id=%s",
                session_id,
                photo_id,
            )

            # 2) Create the facial similarity check.
            check_resp = await client.post(
                "/checks",
                json={
                    "applicant_id": request.applicant_id,
                    "report_names": ["facial_similarity_photo"],
                    "document_ids": [request.document_id],
                },
                headers=auth_header,
            )
            check_resp.raise_for_status()
            report_ids = check_resp.json().get("report_ids") or []
            if not report_ids:
                logger.error(
                    "Onfido check returned no report_ids: session=%s", session_id
                )
                return _error_result(session_id, "onfido_no_report_id")
            report_id = report_ids[0]
            logger.info(
                "Onfido check created: session=%s report_id=%s",
                session_id,
                report_id,
            )

            # 3) Poll the report until it completes (max 50s).
            report: Dict[str, Any] = {}
            completed = False
            for attempt in range(_POLL_MAX_ATTEMPTS):
                report_resp = await client.get(
                    f"/reports/{report_id}", headers=auth_header
                )
                report_resp.raise_for_status()
                report = report_resp.json()
                status = report.get("status")
                logger.debug(
                    "Onfido report poll: session=%s attempt=%s status=%s",
                    session_id,
                    attempt + 1,
                    status,
                )
                if status == "complete":
                    completed = True
                    break
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            if not completed:
                logger.warning(
                    "Onfido report polling timed out: session=%s report_id=%s",
                    session_id,
                    report_id,
                )
                return _error_result(session_id, "timeout")

            # 4) Parse the completed report.
            result = _parse_report(report, session_id)
            logger.info(
                "Onfido biometric check exit: session=%s result=%s "
                "face_match=%s similarity=%s",
                session_id,
                result.result,
                result.face_match,
                result.similarity_score,
            )
            return result

    except httpx.TimeoutException:
        logger.warning("Onfido request timed out: session=%s", session_id)
        return _error_result(session_id, "onfido_timeout")
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code if e.response is not None else None
        if status_code == 401:
            logger.error("Onfido auth failed (401): session=%s", session_id)
            return _error_result(session_id, "onfido_auth_failed")
        if status_code == 422:
            logger.error(
                "Onfido invalid request (422): session=%s", session_id
            )
            return _error_result(session_id, "onfido_invalid_request")
        logger.error(
            "Onfido HTTP error (%s): session=%s", status_code, session_id
        )
        return _error_result(session_id, f"onfido_error: {str(e)}")
    except Exception as e:  # noqa: BLE001
        logger.error(
            "Onfido unexpected error: session=%s\n%s",
            session_id,
            traceback.format_exc(),
        )
        return _error_result(session_id, f"onfido_error: {str(e)}")
