import requests


def test_add_to_cart(base_url, fresh_user):
    h = fresh_user["header"]
    r = requests.post(f"{base_url}/cart/add", headers=h,
                      json={"wine_id": 1, "quantity": 2})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_get_cart(base_url, fresh_user):
    h = fresh_user["header"]
    requests.post(f"{base_url}/cart/add", headers=h, json={"wine_id": 2, "quantity": 1})
    r = requests.get(f"{base_url}/cart", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "items" in data
    assert len(data["items"]) > 0


def test_update_cart_quantity(base_url, fresh_user):
    h = fresh_user["header"]
    requests.post(f"{base_url}/cart/add", headers=h, json={"wine_id": 3, "quantity": 1})
    r = requests.put(f"{base_url}/cart/update", headers=h,
                     json={"wine_id": 3, "quantity": 5})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_remove_from_cart(base_url, fresh_user):
    h = fresh_user["header"]
    requests.post(f"{base_url}/cart/add", headers=h, json={"wine_id": 4, "quantity": 1})
    r = requests.delete(f"{base_url}/cart/remove/4", headers=h)
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_cart_total(base_url, fresh_user):
    h = fresh_user["header"]
    requests.post(f"{base_url}/cart/add", headers=h, json={"wine_id": 1, "quantity": 1})
    r = requests.get(f"{base_url}/cart", headers=h)
    data = r.json()
    assert "total" in data
    assert data["total"] > 0


def test_cart_unauthenticated(base_url):
    r = requests.get(f"{base_url}/cart")
    assert r.status_code == 401
