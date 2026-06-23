"""Tests for the AWS Rekognition fallback."""
from unittest.mock import MagicMock

from botocore.exceptions import NoCredentialsError

from app.rekognition_fallback import rekognition_face_match

_SELFIE = "c2VsZmll"  # base64 of "selfie"
_DOC = "ZG9jdW1lbnQ="  # base64 of "document"


def _mock_boto(mocker, compare_faces_return: dict) -> MagicMock:
    """Patch boto3.client to return a rekognition client mock."""
    rek_client = MagicMock()
    rek_client.compare_faces.return_value = compare_faces_return
    mocker.patch(
        "app.rekognition_fallback.boto3.client", return_value=rek_client
    )
    return rek_client


def test_successful_face_match(mocker, settings) -> None:
    """A 92% match maps to a clear, matching rekognition result."""
    _mock_boto(
        mocker,
        {"FaceMatches": [{"Similarity": 92.0, "Face": {}}], "UnmatchedFaces": []},
    )

    result = rekognition_face_match(_SELFIE, _DOC, settings, "sess-1")

    assert result.face_match is True
    assert result.similarity_score == 0.92
    assert result.result == "clear"
    assert result.source == "rekognition"
    assert result.liveness_passed is False


def test_no_face_match(mocker, settings) -> None:
    """No face matches map to a consider result with score 0.0."""
    _mock_boto(mocker, {"FaceMatches": [], "UnmatchedFaces": []})

    result = rekognition_face_match(_SELFIE, _DOC, settings, "sess-1")

    assert result.face_match is False
    assert result.result == "consider"
    assert result.similarity_score == 0.0


def test_below_threshold(mocker, settings) -> None:
    """A 75% match is below the 85% threshold and does not match."""
    _mock_boto(mocker, {"FaceMatches": [{"Similarity": 75.0}]})

    result = rekognition_face_match(_SELFIE, _DOC, settings, "sess-1")

    assert result.face_match is False


def test_aws_credentials_error(mocker, settings) -> None:
    """Missing AWS credentials are reported as aws_credentials_missing."""
    mocker.patch(
        "app.rekognition_fallback.boto3.client",
        side_effect=NoCredentialsError(),
    )

    result = rekognition_face_match(_SELFIE, _DOC, settings, "sess-1")

    assert result.error == "aws_credentials_missing"
    assert result.result == "unidentified"
