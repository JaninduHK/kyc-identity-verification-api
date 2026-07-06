"""Rule-based IP risk assessment.

This replaces the previous constant "benign" stub with a real (if modest)
assessment derived from the actual IP address: private/reserved addresses are
treated as benign, addresses inside known datacenter/hosting ranges are flagged
as proxy/VPN traffic, and other public addresses get a low baseline score.

A production deployment would back this with a MaxMind GeoIP2 / IP-intelligence
lookup; the datacenter ranges below are an illustrative built-in heuristic.
"""
import ipaddress
from typing import Any, Dict, List, Optional

# Illustrative datacenter/hosting ranges. Traffic originating here is far more
# likely to be VPN/proxy than a residential connection.
_DATACENTER_CIDRS = [
    "8.8.8.0/24",    # Google Public DNS
    "8.8.4.0/24",    # Google Public DNS
    "1.1.1.0/24",    # Cloudflare
    "34.64.0.0/10",  # Google Cloud
    "52.0.0.0/11",   # AWS
    "13.32.0.0/15",  # AWS CloudFront
    "20.33.0.0/16",  # Azure
]
_DATACENTER_NETWORKS = [ipaddress.ip_network(cidr) for cidr in _DATACENTER_CIDRS]


def _result(
    score: float,
    is_vpn: bool,
    is_proxy: bool,
    factors: List[str],
    country: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "ipRiskScore": score,
        "isVpn": is_vpn,
        "isProxy": is_proxy,
        "country": country,
        "factors": factors,
    }


def assess_ip(ip_address: Optional[str]) -> Dict[str, Any]:
    """Assess the risk of a client IP address.

    Returns a dict with ``ipRiskScore`` (0-100), ``isVpn``, ``isProxy``,
    ``country`` and a list of ``factors`` explaining the score.
    """
    if not ip_address:
        return _result(0.0, False, False, ["no_ip"])

    try:
        ip = ipaddress.ip_address(ip_address)
    except ValueError:
        return _result(0.0, False, False, ["invalid_ip"])

    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        return _result(0.0, False, False, ["private_ip"])

    for network in _DATACENTER_NETWORKS:
        if ip in network:
            return _result(80.0, True, True, ["datacenter_ip"])

    return _result(10.0, False, False, ["public_ip"])
