"""Tests for the rule-based risk scoring engine."""
from app.scoring import rule_based_score


def test_clean_checks_score_zero() -> None:
    score, factors = rule_based_score(
        {
            "document": {"result": "clear"},
            "biometric": {"result": "clear", "livenessPassed": True},
            "aml": {"riskLevel": "none"},
            "ip": {},
        }
    )
    assert score == 0.0
    assert factors == []


def test_document_consider() -> None:
    score, factors = rule_based_score({"document": {"result": "consider"}})
    assert score == 60.0
    assert "document_result_consider" in factors


def test_aml_high_risk() -> None:
    score, factors = rule_based_score({"aml": {"riskLevel": "high"}})
    assert score == 80.0
    assert "aml_high_risk" in factors


def test_biometric_unidentified() -> None:
    score, factors = rule_based_score({"biometric": {"result": "unidentified"}})
    assert score == 40.0
    assert "biometric_unidentified" in factors


def test_biometric_error_is_penalised() -> None:
    score, factors = rule_based_score({"biometric": {"result": "error"}})
    assert score == 40.0
    assert "biometric_error" in factors


def test_liveness_failed_on_real_check() -> None:
    score, factors = rule_based_score(
        {"biometric": {"result": "clear", "livenessPassed": False}}
    )
    assert score == 20.0
    assert "biometric_liveness_failed" in factors


def test_liveness_not_penalised_on_error() -> None:
    # An errored biometric is penalised as an error, not additionally for
    # liveness (livenessPassed defaults to False on the error result).
    score, factors = rule_based_score(
        {"biometric": {"result": "error", "livenessPassed": False}}
    )
    assert score == 40.0
    assert "biometric_liveness_failed" not in factors


def test_image_integrity_camelcase() -> None:
    score, factors = rule_based_score(
        {"document": {"result": "clear", "imageIntegrity": {"result": "consider"}}}
    )
    assert score == 70.0
    assert "image_integrity_consider" in factors


def test_image_integrity_snakecase_still_works() -> None:
    score, factors = rule_based_score(
        {"document": {"result": "clear", "image_integrity": {"result": "consider"}}}
    )
    assert "image_integrity_consider" in factors


def test_ip_signals() -> None:
    score, factors = rule_based_score(
        {"ip": {"isVpn": True, "isProxy": True, "ipRiskScore": 90}}
    )
    assert "ip_vpn" in factors
    assert "ip_proxy" in factors
    assert "ip_high_risk_score" in factors


def test_score_capped_at_100() -> None:
    score, _ = rule_based_score(
        {
            "document": {"result": "consider", "imageIntegrity": {"result": "consider"}},
            "aml": {"riskLevel": "high"},
            "biometric": {"result": "consider"},
        }
    )
    assert score == 100.0
