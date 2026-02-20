import requests


SHIPPING = {
    "name": "Test User",
    "street": "Rua de Teste 1",
    "city": "Lisboa",
    "postal_code": "1000-001",
    "phone": "+351911111111",
}


def _place_order(base_url, header):
    """Add item to cart and place an order. Returns the order_id."""
    requests.post(f"{base_url}/cart/add", headers=header,
                  json={"wine_id": 1, "quantity": 1})
    r = requests.post(f"{base_url}/orders", headers=header,
                      json={"shipping_address": SHIPPING})
    return r


def test_create_order(base_url, fresh_user):
    r = _place_order(base_url, fresh_user["header"])
    assert r.status_code == 201
    data = r.json()
    assert data["success"] is True
    assert "order_id" in data


def test_list_orders(base_url, joe_token):
    h = {"Authorization": f"Bearer {joe_token}"}
    r = requests.get(f"{base_url}/orders", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert len(data["orders"]) >= 2  # Joe has pre-seeded orders


def test_order_detail(base_url, fresh_user):
    order_r = _place_order(base_url, fresh_user["header"])
    oid = order_r.json()["order_id"]
    r = requests.get(f"{base_url}/orders/{oid}", headers=fresh_user["header"])
    assert r.status_code == 200
    order = r.json()["order"]
    assert order["id"] == oid
    assert "items" in order
    assert len(order["items"]) > 0


def test_order_empty_cart(base_url, fresh_user):
    r = requests.post(f"{base_url}/orders", headers=fresh_user["header"],
                      json={"shipping_address": SHIPPING})
    assert r.status_code == 400


def test_order_missing_address(base_url, fresh_user):
    requests.post(f"{base_url}/cart/add", headers=fresh_user["header"],
                  json={"wine_id": 1, "quantity": 1})
    r = requests.post(f"{base_url}/orders", headers=fresh_user["header"], json={})
    assert r.status_code == 400


def test_order_unauthenticated(base_url):
    r = requests.post(f"{base_url}/orders", json={"shipping_address": SHIPPING})
    assert r.status_code == 401
