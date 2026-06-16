"""OCR fallback using Tesseract.

Heavy native imports (cv2, numpy, pytesseract) are performed lazily inside the
functions that use them so that this module can be imported without those
libraries installed.
"""
from typing import Any, Dict


def preprocess_image(img_array: Any) -> Any:
    """Preprocess an image array for better OCR accuracy.

    Converts to grayscale, denoises, and applies adaptive thresholding.
    """
    import cv2
    import numpy  # noqa: F401  (imported to ensure availability / parity)

    gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, 30, 7, 21)
    processed = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2,
    )
    return processed


def extract_nic_tesseract(image_b64: str) -> Dict[str, Any]:
    """Extract NIC details from a base64-encoded image using Tesseract."""
    import base64
    import re

    import cv2
    import numpy
    import pytesseract

    try:
        image_bytes = base64.b64decode(image_b64)
        np_arr = numpy.frombuffer(image_bytes, dtype=numpy.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image from base64 input")

        processed = preprocess_image(img)
        raw_text = pytesseract.image_to_string(processed, lang="sin+tam+eng")

        nic: str | None = None
        enic_match = re.search(r"\d{12}", raw_text)
        if enic_match:
            nic = enic_match.group(0)
        else:
            old_match = re.search(r"\d{9}[Vv]", raw_text)
            if old_match:
                nic = old_match.group(0)

        return {"nic": nic, "raw_text": raw_text, "method": "tesseract"}
    except Exception as e:  # noqa: BLE001
        return {
            "nic": None,
            "raw_text": "",
            "method": "tesseract",
            "error": str(e),
        }
