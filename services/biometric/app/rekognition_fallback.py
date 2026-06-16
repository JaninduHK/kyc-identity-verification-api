"""AWS Rekognition fallback for face matching.

Heavy imports (boto3) are performed lazily inside the function so this module
can be imported without those libraries installed.
"""
from typing import Any, Dict


def rekognition_face_match(selfie_b64: str, doc_photo_b64: str) -> Dict[str, Any]:
    """Compare a selfie against a document photo using AWS Rekognition."""
    import base64

    import boto3

    try:
        selfie_bytes = base64.b64decode(selfie_b64)
        doc_bytes = base64.b64decode(doc_photo_b64)

        client = boto3.client("rekognition")
        response = client.compare_faces(
            SourceImage={"Bytes": selfie_bytes},
            TargetImage={"Bytes": doc_bytes},
            SimilarityThreshold=80,
        )

        matches = response.get("FaceMatches") or []
        if matches:
            similarity = float(matches[0].get("Similarity", 0.0))
            return {
                "face_match": True,
                "similarity_score": similarity,
                "source": "rekognition",
            }
        return {
            "face_match": False,
            "similarity_score": 0.0,
            "source": "rekognition",
        }
    except Exception as e:  # noqa: BLE001
        return {
            "face_match": False,
            "similarity_score": 0.0,
            "source": "rekognition",
            "error": str(e),
        }
