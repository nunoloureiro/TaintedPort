import uuid

import requests


def test_register_success(base_url):
    uid = uuid.uuid4().hex[:8]
    r = requests.post(f"{base_url}/auth/register", json={
        "name": f"Reg Test {uid}",
        "email": f"regtest_{uid}@example.com",
        "password": "password123",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["success"] is True
    assert "token" in data
    assert data["user"]["email"] == f"regtest_{uid}@example.com"


def test_register_duplicate(base_url):
    r = requests.post(f"{base_url}/auth/register", json={
        "name": "Dup", "email": "joe@example.com", "password": "password123",
    })
    assert r.status_code == 409
    assert r.json()["success"] is False


def test_register_missing_fields(base_url):
    r = requests.post(f"{base_url}/auth/register", json={"name": "X"})
    assert r.status_code == 400


def test_login_success(base_url):
    r = requests.post(f"{base_url}/auth/login", json={
        "email": "joe@example.com", "password": "password123",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "token" in data
    assert data["user"]["email"] == "joe@example.com"


def test_login_wrong_password(base_url):
    r = requests.post(f"{base_url}/auth/login", json={
        "email": "joe@example.com", "password": "wrongpassword",
    })
    assert r.status_code == 401
    assert r.json()["success"] is False


def test_me_with_token(base_url, auth_header):
    r = requests.get(f"{base_url}/auth/me", headers=auth_header)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["user"]["email"] == "joe@example.com"


def test_me_without_token(base_url):
    r = requests.get(f"{base_url}/auth/me")
    assert r.status_code == 401


def test_update_profile(base_url, fresh_user):
    r = requests.put(f"{base_url}/auth/profile", headers=fresh_user["header"],
                     json={"name": "Updated Name"})
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "Updated Name"


def test_change_email(base_url, fresh_user):
    new_email = f"changed_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.put(f"{base_url}/auth/email", headers=fresh_user["header"],
                     json={"password": fresh_user["password"], "new_email": new_email})
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "token" in data


def test_change_email_wrong_password(base_url, fresh_user):
    r = requests.put(f"{base_url}/auth/email", headers=fresh_user["header"],
                     json={"password": "wrongpass", "new_email": "x@x.com"})
    assert r.status_code == 401


def test_change_password(base_url, fresh_user):
    r = requests.put(f"{base_url}/auth/password", headers=fresh_user["header"],
                     json={"current_password": fresh_user["password"], "new_password": "newpassword123"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_2fa_setup_and_disable(base_url, fresh_user):
    h = fresh_user["header"]
    r = requests.post(f"{base_url}/auth/2fa/setup", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert "secret" in data
    assert "otpauth_uri" in data
