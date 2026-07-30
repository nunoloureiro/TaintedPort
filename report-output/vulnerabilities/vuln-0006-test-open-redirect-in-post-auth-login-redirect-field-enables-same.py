     1	#!/usr/bin/env python3
     2	"""Verify: Open Redirect on POST /auth/login `redirect` field.
     3	
     4	Checks whether the server still echoes an unvalidated `redirect` value as
     5	`redirect_url` — the root cause of the same-origin XSS. If the API rejects,
     6	strips, or ignores unsafe schemes (javascript:, data:, //, external https:),
     7	the finding is considered fixed.
     8	
     9	Exit codes:
    10	  0 = [VULNERABLE]    server reflects at least one unsafe `redirect` value
    11	  1 = [NOT VULNERABLE] server sanitises / drops `redirect_url`
    12	
    13	Required environment variables:
    14	    VICTIM_PASSWORD     Password for the login account
    15	
    16	Optional (override defaults):
    17	    TARGET_API          API base URL (default: https://api.taintedport.com)
    18	    VICTIM_USERNAME     Login email (default: recon-2e354c95@example.com)
    19	
    20	Usage:
    21	    export VICTIM_PASSWORD='ReconTest!23-scan-2e354c95'
    22	    python3 verify.py
    23	"""
    24	import os
    25	import sys
    26	
    27	import requests
    28	import urllib3
    29	
    30	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    31	
    32	TARGET_API = os.environ.get("TARGET_API", "https://api.taintedport.com")
    33	VICTIM_USERNAME = os.environ.get("VICTIM_USERNAME", "recon-2e354c95@example.com")
    34	VICTIM_PASSWORD = os.environ.get("VICTIM_PASSWORD")
    35	
    36	REQUIRED_VARS = ["VICTIM_PASSWORD"]
    37	
    38	UNSAFE_PAYLOADS = [
    39	    "javascript:alert(1)",
    40	    "https://attacker.example.com/collect",
    41	    "data:text/html,<h1>x</h1>",
    42	    "//evil.example.com/",
    43	]
    44	
    45	
    46	def preflight():
    47	    missing = [v for v in REQUIRED_VARS if not os.environ.get(v)]
    48	    if missing:
    49	        print("ERROR: missing required environment variables:")
    50	        for v in missing:
    51	            print(f"  {v}")
    52	        print("\nUsage: export VICTIM_PASSWORD=...; python3 verify.py")
    53	        sys.exit(1)
    54	
    55	
    56	def login_with_redirect(payload):
    57	    r = requests.post(
    58	        f"{TARGET_API}/auth/login",
    59	        json={"email": VICTIM_USERNAME, "password": VICTIM_PASSWORD, "redirect": payload},
    60	        verify=False,
    61	        timeout=15,
    62	    )
    63	    if r.status_code != 200:
    64	        return None
    65	    try:
    66	        return r.json()
    67	    except ValueError:
    68	        return None
    69	
    70	
    71	def check():
    72	    preflight()
    73	    reflected = []
    74	    for p in UNSAFE_PAYLOADS:
    75	        data = login_with_redirect(p)
    76	        if data and data.get("redirect_url") == p:
    77	            reflected.append(p)
    78	
    79	    if reflected:
    80	        print("[VULNERABLE] Server echoes unsafe `redirect` values verbatim as `redirect_url`:")
    81	        for p in reflected:
    82	            print(f"  - {p!r}")
    83	        sys.exit(0)
    84	
    85	    print("[NOT VULNERABLE] Server did not reflect any of the unsafe redirect payloads.")
    86	    sys.exit(1)
    87	
    88	
    89	if __name__ == "__main__":
    90	    check()