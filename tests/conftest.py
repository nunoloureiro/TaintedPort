import os
import subprocess
import uuid

import pytest
import requests

BASE_URL = os.environ.get("TAINTEDPORT_API_URL", "http://localhost:8000")
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    return r.json()["token"]


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session", autouse=True)
def reset_db():
    """Reset the database once before the entire test session."""
    subprocess.run(["php", "setup_db.php"], cwd=BACKEND_DIR, check=True, capture_output=True)
    yield
    subprocess.run(["php", "setup_db.php"], cwd=BACKEND_DIR, check=True, capture_output=True)


@pytest.fixture(scope="session")
def joe_token():
    return _login("joe@example.com", "password123")


@pytest.fixture(scope="session")
def jane_token():
    return _login("jane@example.com", "password123")


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin@example.com", "password123")


@pytest.fixture
def auth_header(joe_token):
    return {"Authorization": f"Bearer {joe_token}"}


@pytest.fixture
def jane_header(jane_token):
    return {"Authorization": f"Bearer {jane_token}"}


@pytest.fixture
def admin_header(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def fresh_user(base_url):
    """Register a unique user for tests that need isolated state."""
    uid = uuid.uuid4().hex[:8]
    payload = {
        "name": f"Test User {uid}",
        "email": f"test_{uid}@example.com",
        "password": "password123",
    }
    r = requests.post(f"{base_url}/auth/register", json=payload)
    data = r.json()
    return {
        "token": data["token"],
        "header": {"Authorization": f"Bearer {data['token']}"},
        "user": data["user"],
        "email": payload["email"],
        "password": payload["password"],
    }
