"""Tests for the rule-based IP risk assessment."""
from app.ip_risk import assess_ip


def test_no_ip_is_benign() -> None:
    r = assess_ip(None)
    assert r["ipRiskScore"] == 0.0
    assert r["isVpn"] is False
    assert r["factors"] == ["no_ip"]


def test_invalid_ip() -> None:
    r = assess_ip("not-an-ip")
    assert r["ipRiskScore"] == 0.0
    assert r["factors"] == ["invalid_ip"]


def test_private_ip_is_benign() -> None:
    r = assess_ip("10.0.0.1")
    assert r["ipRiskScore"] == 0.0
    assert r["isProxy"] is False
    assert r["factors"] == ["private_ip"]


def test_loopback_is_benign() -> None:
    r = assess_ip("127.0.0.1")
    assert r["factors"] == ["private_ip"]


def test_datacenter_ip_flagged_as_proxy() -> None:
    r = assess_ip("8.8.8.8")
    assert r["ipRiskScore"] == 80.0
    assert r["isVpn"] is True
    assert r["isProxy"] is True
    assert r["factors"] == ["datacenter_ip"]


def test_public_residential_ip_low_baseline() -> None:
    r = assess_ip("203.94.1.1")
    assert r["ipRiskScore"] == 10.0
    assert r["isVpn"] is False
    assert r["factors"] == ["public_ip"]


def test_ipv6_public() -> None:
    r = assess_ip("2606:4700:4700::1111")
    # Not in the (IPv4) datacenter list; treated as public baseline.
    assert r["ipRiskScore"] == 10.0
