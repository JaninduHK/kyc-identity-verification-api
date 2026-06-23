"""AWS Rekognition fallback for face matching.

Used when Onfido is unavailable. Unlike Onfido, this does a direct image-to-
image face comparison and does NOT perform any liveness detection — so
``liveness_passed`` is always ``False`` for Rekognition results.

This function is synchronous because boto3 is not async.
"""
import base64
import logging

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from app.config import Settings
from app.models import BiometricCheckResult

logger = logging.getLogger("kestrel.biometric.rekognition")

_SIMILARITY_THRESHOLD = 80
_FACE_MATCH_THRESHOLD = 0.85


def rekognition_face_match(
    selfie_base64: str,
    doc_photo_base64: str,
    settings: Settings,
    session_id: str = "unknown",
) -> BiometricCheckResult:
    """Compare a selfie against a document photo using AWS Rekognition.

    Always returns a :class:`BiometricCheckResult`; never raises.
    """
    logger.info("Rekognition face match entry: session=%s", session_id)

    try:
        selfie_bytes = base64.b64decode(selfie_base64)
        doc_photo_bytes = base64.b64decode(doc_photo_base64)

        client = boto3.client("rekognition", region_name=settings.AWS_REGION)
        response = client.compare_faces(
            SourceImage={"Bytes": selfie_bytes},
            TargetImage={"Bytes": doc_photo_bytes},
            SimilarityThreshold=_SIMILARITY_THRESHOLD,
        )

        matches = response.get("FaceMatches") or []
        if matches:
            similarity = matches[0]["Similarity"] / 100.0
        else:
            similarity = 0.0

        face_match = similarity >= _FACE_MATCH_THRESHOLD
        result = "clear" if face_match else "consider"

        logger.info(
            "Rekognition face match exit: session=%s result=%s "
            "face_match=%s similarity=%s",
            session_id,
            result,
            face_match,
            round(similarity, 4),
        )
        return BiometricCheckResult(
            session_id=session_id,
            result=result,  # type: ignore[arg-type]
            face_match=face_match,
            similarity_score=round(similarity, 4),
            liveness_passed=False,
            source="rekognition",
            onfido_report_id=None,
            breakdown=None,
            error=None,
        )

    except NoCredentialsError:
        logger.error(
            "Rekognition AWS credentials missing: session=%s", session_id
        )
        return BiometricCheckResult(
            session_id=session_id,
            result="unidentified",
            face_match=False,
            similarity_score=0.0,
            liveness_passed=False,
            source="rekognition",
            onfido_report_id=None,
            breakdown=None,
            error="aws_credentials_missing",
        )
    except ClientError as e:
        message = e.response.get("Error", {}).get("Message", str(e))
        logger.error(
            "Rekognition client error: session=%s error=%s", session_id, message
        )
        return BiometricCheckResult(
            session_id=session_id,
            result="unidentified",
            face_match=False,
            similarity_score=0.0,
            liveness_passed=False,
            source="rekognition",
            onfido_report_id=None,
            breakdown=None,
            error=f"rekognition_error: {message}",
        )
