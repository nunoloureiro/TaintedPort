import requests


def test_admin_list_orders(base_url, admin_header):
    r = requests.get(f"{base_url}/admin/orders", headers=admin_header)
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert len(data["orders"]) >= 5  # Pre-seeded orders


def test_admin_get_order(base_url, admin_header):
    r = requests.get(f"{base_url}/admin/orders/1", headers=admin_header)
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_admin_update_status(base_url, admin_header):
    r = requests.put(f"{base_url}/admin/orders/1/status", headers=admin_header,
                     json={"status": "shipped"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_admin_non_admin_rejected(base_url, auth_header):
    r = requests.get(f"{base_url}/admin/orders", headers=auth_header)
    assert r.status_code == 403
