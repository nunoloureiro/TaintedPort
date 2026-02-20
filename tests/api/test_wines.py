import requests


def test_list_all_wines(base_url):
    r = requests.get(f"{base_url}/wines")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["total"] >= 20


def test_search_wines(base_url):
    r = requests.get(f"{base_url}/wines", params={"search": "Douro"})
    assert r.status_code == 200
    wines = r.json()["wines"]
    assert len(wines) > 0
    assert any("Douro" in w.get("region", "") for w in wines)


def test_filter_by_region(base_url):
    r = requests.get(f"{base_url}/wines", params={"region": "Alentejo"})
    data = r.json()
    assert data["success"] is True
    for w in data["wines"]:
        assert w["region"] == "Alentejo"


def test_filter_by_type(base_url):
    r = requests.get(f"{base_url}/wines", params={"type": "Red"})
    data = r.json()
    assert data["success"] is True
    for w in data["wines"]:
        assert w["type"] == "Red"


def test_price_range(base_url):
    r = requests.get(f"{base_url}/wines", params={"minPrice": 100, "maxPrice": 500})
    data = r.json()
    for w in data["wines"]:
        assert 100 <= w["price"] <= 500


def test_sort_price_asc(base_url):
    r = requests.get(f"{base_url}/wines", params={"sort": "price_asc"})
    wines = r.json()["wines"]
    prices = [w["price"] for w in wines]
    assert prices == sorted(prices)


def test_sort_price_desc(base_url):
    r = requests.get(f"{base_url}/wines", params={"sort": "price_desc"})
    wines = r.json()["wines"]
    prices = [w["price"] for w in wines]
    assert prices == sorted(prices, reverse=True)


def test_get_wine_by_id(base_url):
    r = requests.get(f"{base_url}/wines/1")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["wine"]["id"] == 1


def test_get_wine_not_found(base_url):
    r = requests.get(f"{base_url}/wines/99999")
    assert r.status_code == 404


def test_regions(base_url):
    r = requests.get(f"{base_url}/wines/regions")
    data = r.json()
    assert data["success"] is True
    assert len(data["regions"]) > 0


def test_types(base_url):
    r = requests.get(f"{base_url}/wines/types")
    data = r.json()
    assert data["success"] is True
    assert "Red" in data["types"]
