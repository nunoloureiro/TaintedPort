     1	#!/usr/bin/env python3
     2	"""Verify: CORS misconfiguration on TaintedPort API — arbitrary Origin
     3	reflected with `Access-Control-Allow-Credentials: true`.
     4	
     5	Exit code 0 => VULNERABLE (still exploitable)
     6	Exit code 1 => NOT VULNERABLE / mitigated
     7	
     8	Optional environment variables:
     9	    TARGET_API_URL      (default: https://api.taintedport.com)
    10	    TARGET_FRONTEND_URL (default: https://taintedport.com)
    11	
    12	Usage:
    13	    python3 verify.py
    14	"""
    15	import os
    16	import sys
    17	
    18	import requests
    19	import urllib3
    20	
    21	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    22	
    23	API   = os.environ.get("TARGET_API_URL",      "https://api.taintedport.com")
    24	FRONT = os.environ.get("TARGET_FRONTEND_URL", "https://taintedport.com")
    25	
    26	# Attacker origins we require to be REJECTED for the policy to be safe.
    27	BAD_ORIGINS = ["https://attacker.example", "null", "file://"]
    28	
    29	TARGETS = [
    30	    f"{API}/wines",
    31	    f"{FRONT}/api/wines",
    32	]
    33	
    34	def probe(url, origin, method="GET", extra=None):
    35	    headers = {"Origin": origin, "Accept": "application/json"}
    36	    if extra:
    37	        headers.update(extra)
    38	    r = requests.request(method, url, headers=headers, verify=False, timeout=20)
    39	    h = {k.lower(): v for k, v in r.headers.items()}
    40	    return (
    41	        h.get("access-control-allow-origin", ""),
    42	        h.get("access-control-allow-credentials", ""),
    43	    )
    44	
    45	def main():
    46	    failures = []
    47	    for url in TARGETS:
    48	        for origin in BAD_ORIGINS:
    49	            acao, acac = probe(url, origin)
    50	            if acao == origin and acac.lower() == "true":
    51	                failures.append(f"{url}  Origin={origin}  ACAO={acao}  ACAC={acac}")
    52	
    53	    # Preflight check
    54	    acao, acac = probe(f"{API}/auth/login", "https://attacker.example",
    55	                       method="OPTIONS",
    56	                       extra={
    57	                           "Access-Control-Request-Method":  "POST",
    58	                           "Access-Control-Request-Headers": "Authorization, Content-Type",
    59	                       })
    60	    if acao == "https://attacker.example" and acac.lower() == "true":
    61	        failures.append(f"OPTIONS {API}/auth/login  reflected attacker origin+creds")
    62	
    63	    if failures:
    64	        print("[VULNERABLE] CORS misconfiguration — reflected Origin with credentials:")
    65	        for f in failures:
    66	            print(f"  {f}")
    67	        sys.exit(0)
    68	    else:
    69	        print("[NOT VULNERABLE] Attacker origins were not reflected with credentials.")
    70	        sys.exit(1)
    71	
    72	if __name__ == "__main__":
    73	    main()