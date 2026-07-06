"""Rule-based risk scoring engine.

The scoring is purely additive. Each rule inspects the loosely-typed check
results and, when triggered, adds points to the running total and appends a
human-readable factor string. The final score is capped at 100.0.
"""

from typing import Any


def _as_dict(value: Any) -> dict[str, Any]:
    """Return ``value`` if it is a dict, otherwise an empty dict.

    Inputs arrive from upstream services as loosely-typed JSON, so any field
    we expect to be an object might in practice be missing or a scalar.
    """

    return value if isinstance(value, dict) else {}


def _to_float(value: Any) -> float:
    """Best-effort numeric coercion; returns 0.0 on failure."""

    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def rule_based_score(checks: dict[str, Any]) -> tuple[float, list[str]]:
    """Compute an additive risk score from merged check results.

    Args:
        checks: A merged mapping with optional ``document``, ``biometric``,
            ``aml`` and ``ip`` sub-dicts.

    Returns:
        A tuple of (score capped at 100.0, list of triggered factor strings).
    """

    document = _as_dict(checks.get("document"))
    biometric = _as_dict(checks.get("biometric"))
    aml = _as_dict(checks.get("aml"))
    ip = _as_dict(checks.get("ip"))

    total: float = 0.0
    factors: list[str] = []

    # Document overall result.
    if document.get("result") == "consider":
        total += 60.0
        factors.append("document_result_consider")

    # AML risk level (accept both camelCase and snake_case).
    aml_risk_level = aml.get("riskLevel", aml.get("risk_level"))
    if aml_risk_level == "high":
        total += 80.0
        factors.append("aml_high_risk")

    # Biometric overall result.
    biometric_result = biometric.get("result")
    if biometric_result == "consider":
        total += 50.0
        factors.append("biometric_consider")
    elif biometric_result == "unidentified":
        total += 40.0
        factors.append("biometric_unidentified")
    elif biometric_result == "error":
        # The check could not be completed — treat as unverified, not a pass.
        total += 40.0
        factors.append("biometric_error")

    # Biometric liveness: only meaningful when a real check ran (not on error).
    if biometric_result in ("clear", "consider"):
        liveness = biometric.get("livenessPassed", biometric.get("liveness_passed"))
        if liveness is False:
            total += 20.0
            factors.append("biometric_liveness_failed")

    # Document image integrity (accept camelCase and snake_case; dict with a
    # 'result' key).
    image_integrity = _as_dict(
        document.get("imageIntegrity", document.get("image_integrity"))
    )
    if image_integrity.get("result") == "consider":
        total += 70.0
        factors.append("image_integrity_consider")

    # AML medium risk.
    if aml_risk_level == "medium":
        total += 20.0
        factors.append("aml_medium_risk")

    # IP VPN.
    if ip.get("isVpn", ip.get("is_vpn")):
        total += 15.0
        factors.append("ip_vpn")

    # IP proxy.
    if ip.get("isProxy", ip.get("is_proxy")):
        total += 20.0
        factors.append("ip_proxy")

    # IP risk score threshold.
    ip_risk_score = _to_float(ip.get("ipRiskScore", ip.get("ip_risk_score")))
    if ip_risk_score > 60:
        total += 10.0
        factors.append("ip_high_risk_score")

    # Unidentified document.
    if document.get("result") == "unidentified":
        total += 25.0
        factors.append("document_unidentified")

    return min(total, 100.0), factors
