"""
XSS PoC Tests (Vulnerabilities #6-#10)

Each test verifies that an XSS payload is returned unescaped in the API response,
proving the vulnerability is real.
"""
import requests


XSS_PAYLOAD = '<img src=x onerror=alert("XSS")>'
SCRIPT_PAYLOAD = '<script>alert("XSS")</script>'


class TestReflectedXSSLogin:
    """#6 - Reflected XSS on POST /auth/login (email in error message)"""

    def test_vuln_06_reflected_xss_login(self, base_url):
        """XSS payload in email is reflected unescaped in the error message."""
        r = requests.post(f"{base_url}/auth/login", json={
            "email": XSS_PAYLOAD,
            "password": "wrong",
        })
        data = r.json()
        assert XSS_PAYLOAD in data.get("message", ""), \
            "XSS payload was not reflected in login error message"


class TestReflectedXSSSearch:
    """#7 - Reflected XSS on GET /wines?search= (search query)"""

    def test_vuln_07_reflected_xss_search(self, base_url):
        """XSS payload in search query is reflected unescaped in the response."""
        r = requests.get(f"{base_url}/wines", params={"search": XSS_PAYLOAD})
        data = r.json()
        reflected = data.get("message", "") + data.get("search_query", "")
        assert XSS_PAYLOAD in reflected, \
            "XSS payload was not reflected in search response"


class TestStoredXSSProfileName:
    """#8 - Stored XSS on PUT /auth/profile (name field)"""

    def test_vuln_08_stored_xss_name(self, base_url, fresh_user):
        """XSS payload stored in profile name is returned unescaped via /auth/me."""
        h = fresh_user["header"]
        requests.put(f"{base_url}/auth/profile", headers=h,
                     json={"name": SCRIPT_PAYLOAD})
        r = requests.get(f"{base_url}/auth/me", headers=h)
        name = r.json()["user"]["name"]
        assert SCRIPT_PAYLOAD in name, \
            f"XSS payload was sanitized in stored name: {name}"


class TestStoredXSSCheckout:
    """#9 - Stored XSS on POST /orders (shipping name)"""

    def test_vuln_09_stored_xss_shipping(self, base_url, fresh_user):
        """XSS payload in shipping name is stored and returned in order detail."""
        h = fresh_user["header"]
        requests.post(f"{base_url}/cart/add", headers=h,
                      json={"wine_id": 1, "quantity": 1})
        r = requests.post(f"{base_url}/orders", headers=h, json={
            "shipping_address": {
                "name": SCRIPT_PAYLOAD,
                "street": "Test St", "city": "Test", "postal_code": "1000",
                "phone": "123",
            }
        })
        oid = r.json()["order_id"]
        r2 = requests.get(f"{base_url}/orders/{oid}", headers=h)
        order = r2.json()["order"]
        assert SCRIPT_PAYLOAD in order.get("shipping_name", ""), \
            "XSS payload was sanitized in shipping name"


class TestStoredXSSReview:
    """#10 - Stored XSS on POST /wines/:id/reviews (comment)"""

    def test_vuln_10_stored_xss_review(self, base_url, fresh_user):
        """XSS payload in review comment is stored and returned unescaped."""
        h = fresh_user["header"]
        requests.post(f"{base_url}/wines/5/reviews", headers=h,
                      json={"rating": 3, "comment": SCRIPT_PAYLOAD})
        r = requests.get(f"{base_url}/wines/5/reviews")
        reviews = r.json()["reviews"]
        found = any(SCRIPT_PAYLOAD in rev.get("comment", "") for rev in reviews)
        assert found, "XSS payload was sanitized in review comment"
