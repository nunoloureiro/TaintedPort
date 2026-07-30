     1	#!/usr/bin/env python3
     2	"""Verify: Stateless JWTs Not Invalidated on Password Change (CWE-613).
     3	
     4	Registers a throw-away account, changes its password, and checks whether the
     5	originally-issued JWT still authenticates GET /auth/me. If it does, the
     6	vulnerability is still present.
     7	
     8	Optional environment variables:
     9	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    10	
    11	Exit codes:
    12	    0 → still vulnerable
    13	    1 → fixed / not vulnerable / error
    14	
    15	Usage:
    16	    python3 verify.py
    17	"""
    18	import os
    19	import secrets
    20	import sys
    21	
    22	import requests
    23	import urllib3
    24	
    25	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    26	
    27	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    28	
    29	
    30	def check():
    31	    email = f"ver+{secrets.token_hex(6)}@example.com"
    32	    pw = "InitialPw123!"
    33	
    34	    r = requests.post(f"{TARGET_URL}/auth/register",
    35	                      json={"name": "V", "email": email, "password": pw},
    36	                      timeout=15, verify=False)
    37	    if r.status_code not in (200, 201):
    38	        print(f"[ERROR] Registration failed — HTTP {r.status_code}: {r.text[:200]}")
    39	        sys.exit(1)
    40	    tok = r.json().get("token")
    41	    if not tok:
    42	        print("[ERROR] Registration response contained no token")
    43	        sys.exit(1)
    44	
    45	    # Sanity check: token works pre-change
    46	    r = requests.get(f"{TARGET_URL}/auth/me",
    47	                     headers={"Authorization": f"Bearer {tok}"},
    48	                     timeout=15, verify=False)
    49	    if r.status_code != 200:
    50	        print(f"[ERROR] Fresh token unexpectedly rejected — HTTP {r.status_code}")
    51	        sys.exit(1)
    52	
    53	    # Change password
    54	    new_pw = "ChangedPw456!"
    55	    r = requests.put(f"{TARGET_URL}/auth/password",
    56	                     headers={"Authorization": f"Bearer {tok}"},
    57	                     json={"current_password": pw, "new_password": new_pw},
    58	                     timeout=15, verify=False)
    59	    if r.status_code != 200:
    60	        print(f"[ERROR] Password change failed — HTTP {r.status_code}: {r.text[:200]}")
    61	        sys.exit(1)
    62	
    63	    # Re-use the original token
    64	    r = requests.get(f"{TARGET_URL}/auth/me",
    65	                     headers={"Authorization": f"Bearer {tok}"},
    66	                     timeout=15, verify=False)
    67	    if r.status_code == 200 and r.json().get("success"):
    68	        print(f"[VULNERABLE] Original JWT still authenticates GET /auth/me after "
    69	              f"password change (HTTP 200). CWE-613 — no session invalidation.")
    70	        sys.exit(0)
    71	    else:
    72	        print(f"[NOT VULNERABLE] Original JWT rejected after password change "
    73	              f"(HTTP {r.status_code}).")
    74	        sys.exit(1)
    75	
    76	
    77	if __name__ == "__main__":
    78	    check()