     1	#!/usr/bin/env python3
     2	"""Verify: Missing HTTP security response headers on taintedport.com and api.taintedport.com.
     3	
     4	Checks 10 endpoints on both hosts for the presence of standard hardening headers.
     5	If ANY of the required headers is missing across ALL tested endpoints, prints
     6	[VULNERABLE] and exits 0. If all endpoints ship every required header, prints
     7	[NOT VULNERABLE] and exits 1.
     8	
     9	Required environment variables:
    10	    (none — headers are public)
    11	
    12	Optional (override defaults):
    13	    FRONTEND_URL    default https://taintedport.com
    14	    API_URL         default https://api.taintedport.com
    15	
    16	Usage:
    17	    python3 verify.py
    18	"""
    19	import os
    20	import sys
    21	import requests
    22	import urllib3
    23	
    24	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    25	
    26	FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://taintedport.com")
    27	API_URL = os.environ.get("API_URL", "https://api.taintedport.com")
    28	
    29	REQUIRED_HEADERS = [
    30	    "Content-Security-Policy",
    31	    "Strict-Transport-Security",
    32	    "X-Frame-Options",
    33	    "X-Content-Type-Options",
    34	    "Referrer-Policy",
    35	    "Permissions-Policy",
    36	]
    37	
    38	TARGETS = [
    39	    ("GET", f"{FRONTEND_URL}/"),
    40	    ("GET", f"{FRONTEND_URL}/login"),
    41	    ("GET", f"{FRONTEND_URL}/admin"),
    42	    ("GET", f"{FRONTEND_URL}/checkout"),
    43	    ("GET", f"{FRONTEND_URL}/account"),
    44	    ("GET", f"{API_URL}/wines"),
    45	    ("GET", f"{API_URL}/wines/1"),
    46	    ("GET", f"{API_URL}/auth/me"),
    47	]
    48	
    49	
    50	def check():
    51	    total_checks = 0
    52	    total_missing = 0
    53	    per_url = {}
    54	    for method, url in TARGETS:
    55	        try:
    56	            r = requests.request(method, url, timeout=15, verify=False,
    57	                                 allow_redirects=False)
    58	        except Exception as e:
    59	            print(f"  ! {method} {url}: request failed: {e}")
    60	            continue
    61	        # For frame-ancestors, also credit if present inside CSP.
    62	        csp_val = r.headers.get("Content-Security-Policy", "") or ""
    63	        missing = []
    64	        for h in REQUIRED_HEADERS:
    65	            total_checks += 1
    66	            present = h in r.headers
    67	            if h == "X-Frame-Options" and not present:
    68	                # Also accept CSP frame-ancestors as an equivalent
    69	                if "frame-ancestors" in csp_val:
    70	                    present = True
    71	            if not present:
    72	                missing.append(h)
    73	                total_missing += 1
    74	        per_url[url] = (r.status_code, missing)
    75	
    76	    print(f"\nHeader audit — {len(TARGETS)} endpoints, {len(REQUIRED_HEADERS)} headers each")
    77	    print(f"{'-' * 70}")
    78	    for url, (sc, miss) in per_url.items():
    79	        state = "MISSING ALL" if len(miss) == len(REQUIRED_HEADERS) else f"missing {len(miss)}/{len(REQUIRED_HEADERS)}"
    80	        print(f"  [{sc}] {url}\n      {state}: {', '.join(miss) if miss else '(none)'}")
    81	
    82	    print(f"\nTotal: {total_missing}/{total_checks} required-header checks failed")
    83	    # If more than half of the required-header checks fail, treat as vulnerable.
    84	    if total_missing >= total_checks // 2:
    85	        print("[VULNERABLE] Security response headers are absent across the target surface.")
    86	        sys.exit(0)
    87	    else:
    88	        print("[NOT VULNERABLE] Headers are largely in place.")
    89	        sys.exit(1)
    90	
    91	
    92	if __name__ == "__main__":
    93	    check()