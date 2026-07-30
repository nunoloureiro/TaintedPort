     1	#!/usr/bin/env python3
     2	"""Verify: version-banner disclosure at taintedport.com.
     3	
     4	Checks whether the three information-leak vectors documented in the
     5	finding are still exploitable:
     6	
     7	  1. Origin nginx version leaks in the default 404 body under
     8	     /_next/static/chunks/*.
     9	  2. `X-Powered-By: PHP/<version>` leaks on the API.
    10	  3. `X-Powered-By: Next.js` leaks on the marketing front-end.
    11	
    12	Any single one of these constitutes the finding. The script prints
    13	`[VULNERABLE]` (exit 0) if at least one vector still leaks, otherwise
    14	`[NOT VULNERABLE]` (exit 1).
    15	
    16	Optional environment variables:
    17	    TARGET_URL   Base site URL   (default: https://taintedport.com)
    18	    API_URL      Base API URL    (default: https://api.taintedport.com)
    19	
    20	Usage:
    21	    python3 verify.py
    22	"""
    23	import os
    24	import re
    25	import sys
    26	import uuid
    27	
    28	import requests
    29	import urllib3
    30	
    31	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    32	
    33	TARGET_URL = os.environ.get("TARGET_URL", "https://taintedport.com").rstrip("/")
    34	API_URL = os.environ.get("API_URL", "https://api.taintedport.com").rstrip("/")
    35	
    36	
    37	def check():
    38	    leaks = []
    39	
    40	    # 1. nginx banner in default 404 body
    41	    probe = f"{TARGET_URL}/_next/static/chunks/does-not-exist-{uuid.uuid4().hex[:8]}.js"
    42	    try:
    43	        r = requests.get(probe, verify=False, timeout=15)
    44	        m = re.search(r"nginx/([0-9][0-9.]*)", r.text or "")
    45	        if r.status_code == 404 and m:
    46	            leaks.append(f"nginx/{m.group(1)} in 404 body ({probe})")
    47	    except Exception as e:
    48	        print(f"[ERROR] nginx probe failed: {e}", file=sys.stderr)
    49	
    50	    # 2. PHP X-Powered-By on the API
    51	    try:
    52	        r = requests.get(f"{API_URL}/wines", verify=False, timeout=15)
    53	        xpb = r.headers.get("X-Powered-By", "")
    54	        if xpb.upper().startswith("PHP/"):
    55	            leaks.append(f"{xpb} on {API_URL}/wines")
    56	    except Exception as e:
    57	        print(f"[ERROR] PHP probe failed: {e}", file=sys.stderr)
    58	
    59	    # 3. Next.js X-Powered-By on the front-end
    60	    try:
    61	        r = requests.get(f"{TARGET_URL}/", verify=False, timeout=15)
    62	        xpb = r.headers.get("X-Powered-By", "")
    63	        if xpb.lower() == "next.js":
    64	            leaks.append(f"X-Powered-By: {xpb} on {TARGET_URL}/")
    65	    except Exception as e:
    66	        print(f"[ERROR] Next.js probe failed: {e}", file=sys.stderr)
    67	
    68	    if leaks:
    69	        print(f"[VULNERABLE] {len(leaks)} version-banner leak(s) present:")
    70	        for item in leaks:
    71	            print(f"  - {item}")
    72	        sys.exit(0)
    73	    else:
    74	        print("[NOT VULNERABLE] No version banners observed on the three tested vectors.")
    75	        sys.exit(1)
    76	
    77	
    78	if __name__ == "__main__":
    79	    check()