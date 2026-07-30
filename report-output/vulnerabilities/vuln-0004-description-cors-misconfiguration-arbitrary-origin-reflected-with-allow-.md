# CORS Misconfiguration — Arbitrary Origin Reflected with Allow-Credentials on Both API Hosts

**ID:** vuln-0004
**Severity:** LOW
**Found:** 2026-07-20 11:45:05 UTC
**Target:** https://api.taintedport.com and https://taintedport.com/api/*
**Endpoint:** /* (all paths on both API mount points, including preflight)
**Method:** GET/POST/PUT/DELETE/OPTIONS
**CWE:** CWE-942
**CVSS:** 3.1 (CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N)

## Description

Both `https://api.taintedport.com/*` and `https://taintedport.com/api/*` (two mount points served by the same PHP 8.2.31 backend) reflect the value of the client-supplied `Origin` request header verbatim into `Access-Control-Allow-Origin` and always emit `Access-Control-Allow-Credentials: true`. This behaviour is exhibited on GET, POST, PUT, DELETE and — critically — on the `OPTIONS` preflight, including for state-changing endpoints such as `POST /auth/login`. The special value `Origin: null` is accepted. No `Vary: Origin` header is set on any response.

This is the canonical broken CORS configuration explicitly forbidden by the CORS specification: a wildcard-equivalent (any reflected Origin) must never be paired with `Access-Control-Allow-Credentials: true`.

Attacker origins independently verified as reflected with `ACAC: true` across `/wines`, `/auth/me`, `/api/wines` and `OPTIONS /auth/login` (21/21 combinations):

- `https://attacker.example` — arbitrary attacker host
- `null` — sandboxed iframe / `data:` / `file://` document
- `https://taintedport.com.attacker.example` — suffix trick
- `https://eviltaintedport.com` — prefix trick
- `http://taintedport.com` — scheme downgrade
- `file://`
- `chrome-extension://abc`

Root cause is a server-side CORS middleware that echoes the request's `Origin` header instead of comparing it against a strict allow-list.

## Attack Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│         CORS MISCONFIGURATION — REFLECTED ORIGIN + CREDENTIALS        │
│      https://api.taintedport.com  &  https://taintedport.com/api/*    │
└───────────────────────────────────────────────────────────────────────┘

  Prerequisites:
    • Victim visits an attacker-controlled page in their browser.
    • (Escalation) a same-origin XSS on taintedport.com or any cookie
      issued on either host.

  ┌───────────────┐                              ┌──────────────────────┐
  │  Victim (UA)  │                              │ attacker.example     │
  │  browses to   │◀── loads page ──────────────▶│ (attacker web page)  │
  │  attacker.tld │                              └──────────┬───────────┘
  └───────┬───────┘                                         │
          │                                                 │
          │  ① fetch('https://api.taintedport.com/wines',   │
          │     {method:'GET',                              │
          │      credentials:'include'})                    │
          │◀────────────────────────────────────────────────┘
          │
          │  Browser adds:  Origin: https://attacker.example
          ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │      TaintedPort API  (PHP 8.2.31 — same backend, two hosts)     │
  │                                                                  │
  │   ┌─ CORS middleware (broken) ─────────────────────────────────┐ │
  │   │ header('Access-Control-Allow-Origin: '                     │ │
  │   │        . $_SERVER['HTTP_ORIGIN']);   ◀── ROOT CAUSE        │ │
  │   │ header('Access-Control-Allow-Credentials: true');          │ │
  │   │ // no allow-list check, no Vary: Origin, `null` accepted   │ │
  │   └────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────┘
          │
          │  ② HTTP/1.1 200 OK
          │     Access-Control-Allow-Origin: https://attacker.example
          │     Access-Control-Allow-Credentials: true
          │     (no Vary: Origin)
          │     Content-Type: application/json
          │     { ...API response body... }
          ▼
  ┌───────────────┐
  │  Victim (UA)  │  ③ Browser lets attacker page READ the response
  │               │     because ACAO matches Origin and ACAC:true.
  └───────┬───────┘
          │
          │  ④ Attacker page reads response body:
          │       response.text() ── flows back to attacker.example
          ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  Attacker exfiltrates cross-origin response body                 │
  └──────────────────────────────────────────────────────────────────┘

  Origins that all get reflected + ACAC:true (21/21 tested):
     https://attacker.example  |  null  |  file://  |  chrome-extension://…
     https://taintedport.com.attacker.example  (suffix trick)
     https://eviltaintedport.com               (prefix trick)
     http://taintedport.com                    (scheme-downgrade trick)

  Preflight OPTIONS /auth/login → also approves attacker-origin + creds
  + Authorization header ⇒ state-changing calls are green-lit too.

  ── Current effective impact ────────────────────────────────────────
     Auth uses Authorization: Bearer from localStorage; NO cookies are
     issued today, so ambient-credential theft is NOT yet demonstrable.
     Attacker can only cross-origin read data they could also fetch
     server-side. The broken CORS policy is however a live risk.

  ── Escalation paths (any one of these makes this High/Critical) ────
     [A] Any cookie is issued on either host ─────────────────┐
         ⇒ cross-origin credentialed reads ⇒ ACID data theft. │
     [B] Same-origin XSS on taintedport.com ──────────────────┼─► HIGH
         ⇒ steal JWT from localStorage, replay from any origin│
     [C] Reverse proxy adds HTTP Basic / client TLS certs ────┘
     [D] CDN begins caching API responses (Vary: Origin missing)
         ⇒ one origin's ACAO leaked to another requester.

  ── Root cause ──────────────────────────────────────────────────────
     Server echoes the request's Origin header into ACAO without an
     allow-list, and always sets ACAC:true. This is the exact pattern
     forbidden by the CORS specification.
```

## Impact

**Currently-observed impact (directly exploitable today):**

Any web page under attacker control can, via the victim's browser, make cross-origin requests to the TaintedPort API and read the JSON response. Because `Origin: null` is trusted, the same is possible from a `sandbox="allow-scripts"` iframe, a `data:` document, or a local `file://` page — none of which require the attacker to control a real DNS name. Cross-origin readability of the API is currently limited to data the attacker could also retrieve server-side, since the application uses `Authorization: Bearer <JWT>` from `localStorage.token` and issues no cookies during login. There are therefore no ambient credentials that browsers would attach cross-origin today.

**Live escalation paths inherent in the misconfiguration:**

- If a session cookie, CSRF cookie, analytics cookie, or any other cookie is ever issued on either host, it becomes cross-origin readable / usable from any attacker origin — a fully credentialed CORS breach against every authenticated endpoint.
- Any same-origin XSS on `taintedport.com` (candidates already present in the app: contact-preview reflection, stored review comments, search reflection) can chain with this policy to exfiltrate the JWT from `localStorage` and then re-use it from an arbitrary attacker origin — the API will happily reflect the attacker origin and continue serving authenticated responses.
- If a reverse proxy is later configured to require HTTP Basic auth or client TLS certificates, those credentials become cross-origin readable.
- Missing `Vary: Origin` allows CDN / intermediate caches to serve one origin's ACAO to another requester — a classic CDN CORS defence-in-depth failure that on other stacks yields cache-based CORS attacks.

The policy surface advertised by the server (`ACAC: true` with any-origin reflection, on `Authorization`) is broken independently of the current session mechanism and must be sized against future changes.

## Technical Analysis

The API's CORS layer constructs `Access-Control-Allow-Origin` by echoing the value of the request's `Origin` header rather than comparing it against an explicit allow-list. Independently verified with `curl`:

    > GET /wines HTTP/1.1
    > Host: api.taintedport.com
    > Origin: https://attacker.example

    < HTTP/1.1 200 OK
    < Access-Control-Allow-Credentials: true
    < Access-Control-Allow-Headers: Content-Type, Authorization
    < Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
    < Access-Control-Allow-Origin: https://attacker.example

Every attacker-origin variant tested is reflected identically. The preflight `OPTIONS /auth/login` request approves the cross-origin authed request with the reflected attacker origin and `Access-Control-Allow-Headers: Content-Type, Authorization`.

The `Server` and `X-Powered-By` headers (`cloudflare` / `PHP/8.2.31`) indicate the CORS block is implemented in the PHP application. The most likely root-cause snippet is:

    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

— or an equivalent generic-CORS plugin configured to reflect the request's Origin. No allow-list check is performed, and the special value `null` is not rejected.

The bearer-token session model materially reduces the currently-observable exploitability, because no browser will attach any ambient credentials to a cross-origin fetch. However, the CORS policy layer is broken independently of the session mechanism: `Access-Control-Allow-Credentials: true` is a positive assertion that credentials are permitted, and browsers will honour it against any cookies, HTTP Basic authentication, or client TLS certificates that later become associated with these hosts. Missing `Vary: Origin` is a separate defect: any cache in front of the origin can key on the URL alone and serve one requester's Origin-specific ACAO to a different requester.

## Proof of Concept

1. Send a plain HTTP request to `https://api.taintedport.com/wines` (or `https://taintedport.com/api/wines`, or any `/auth/*`, `/orders/*`, `/cart/*`, `/admin/*` route) with an `Origin: https://attacker.example` request header.
2. Observe the response headers: `Access-Control-Allow-Origin: https://attacker.example` and `Access-Control-Allow-Credentials: true`, with no `Vary: Origin`.
3. Repeat with `Origin: null`, `Origin: https://taintedport.com.attacker.example`, `Origin: file://`, `Origin: chrome-extension://abc` — all reflected identically.
4. Send an `OPTIONS` preflight for `POST /auth/login` with `Origin: https://attacker.example` and `Access-Control-Request-Headers: Authorization, Content-Type` — the server responds with the reflected `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, and `Access-Control-Allow-Headers: Content-Type, Authorization`, greenlighting cross-origin authenticated calls from the attacker.
5. Full matrix reproducer: `python3 poc/poc.py` — probes 7 attacker origins × 3 endpoints and the preflight, reporting 21/21 reflected+credentialed responses and no `Vary: Origin` header on any response.
6. Regression check: `python3 poc/verify.py` — exits 0 (VULNERABLE) while the misconfiguration persists.

```
See poc_script_path.
```

## Evidence

### 1. Arbitrary attacker origin reflected on public GET

**Request:**
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Origin: https://attacker.example
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Origin: https://attacker.example
Content-Type: application/json
X-Powered-By: PHP/8.2.31

{...wine list JSON...}
```

> Server reflects the attacker-supplied Origin verbatim and pairs it with Allow-Credentials: true. No Vary: Origin header is emitted.

### 2. `Origin: null` is accepted (sandboxed-iframe attack surface)

**Request:**
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Origin: null
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: null
Content-Type: application/json

{...wine list JSON...}
```

> The special value `null` is trusted just like any other origin. This is directly exploitable from a sandbox=allow-scripts iframe, a data: document, or a local file:// page — none of which need to control a real DNS name.

### 3. Frontend host `/api/*` is equally misconfigured

**Request:**
```http
GET /api/wines HTTP/1.1
Host: taintedport.com
Origin: https://attacker.example
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: https://attacker.example
Content-Type: application/json

{...wine list JSON...}
```

> The same broken policy is served on the frontend host under /api/* (both mount points are backed by the same PHP 8.2 backend).

### 4. Preflight OPTIONS approves attacker-origin cross-origin authed request

**Request:**
```http
OPTIONS /auth/login HTTP/1.1
Host: api.taintedport.com
Origin: https://attacker.example
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Authorization, Content-Type
```

**Response:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Origin: https://attacker.example
```

> The preflight explicitly greenlights an attacker-origin POST that carries an Authorization header. Any endpoint on either host is reachable cross-origin with credentials.

### 5. Missing Vary: Origin — CDN cache defence-in-depth failure

**Request:**
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Origin: https://eviltaintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK
Cf-Cache-Status: DYNAMIC
Access-Control-Allow-Origin: https://eviltaintedport.com
Access-Control-Allow-Credentials: true
(no Vary: Origin header)
```

> The response varies its Access-Control-Allow-Origin per request-Origin, but no Vary: Origin header is emitted. If any cache upstream of the origin caches this response, one requester's ACAO can be served to a different requester — a classic CDN CORS defence-in-depth failure.


## Remediation

1. **Do not reflect `Origin`.** Compare the incoming `Origin` header against a strict, explicit allow-list of trusted front-end origins (e.g. `https://taintedport.com`). On mismatch, emit no `Access-Control-Allow-Origin` header at all — never fall back to `*` or `null`.

2. **Never combine `Access-Control-Allow-Credentials: true` with a wildcard or dynamically-reflected origin.** If an endpoint truly must be fully public and cross-origin readable, drop `Allow-Credentials` and use `Access-Control-Allow-Origin: *`.

3. **Explicitly reject `Origin: null`.** No production origin should legitimately send `null`.

4. **Emit `Vary: Origin` on every response whose CORS headers vary by request** so caches (including Cloudflare) key each origin's response separately.

5. **Restrict `Access-Control-Allow-Methods` per route.** The current blanket `GET, POST, PUT, DELETE, OPTIONS` on every response is over-broad.

6. **Consider applying CORS only where cross-origin access is actually needed.** State-changing endpoints such as `/auth/login`, `/orders`, `/cart/*`, and `/admin/*` do not need to advertise cross-origin support at all.

Concrete PHP snippet:

    $allowed = ['https://taintedport.com'];
    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
    header('Vary: Origin', false);
    if (in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    }
    // else: emit no CORS headers at all — SOP will block the browser.

## Conditions for Severity Increase

Severity rises sharply if any of the following become true:

- **A cookie is issued on either host** (session cookie, CSRF cookie, analytics, marketing, feature flag). ACAC:true combined with reflected Origin then permits cross-origin credentialed reads from any attacker origin. Confidentiality would rise to H, scope to C, and attack complexity would drop to L (raising CVSS into the High band, ≥ 8.0).

- **A same-origin XSS is found on `taintedport.com`** (contact-preview reflection, stored review comments, and search reflection are already candidates within the application). Combined with the reflected-Origin+ACAC policy, a stolen `localStorage.token` JWT can be re-used against the API from an arbitrary attacker origin, and the API will continue serving authenticated responses. Confidentiality and integrity impacts both rise to H.

- **HTTP Basic authentication or client TLS certificates are introduced at a reverse proxy.** These credentials are ambient in the browser and would then be cross-origin readable / usable from any attacker origin.

- **A CDN begins caching API responses.** Missing `Vary: Origin` means one requester's `Access-Control-Allow-Origin` response can be served to a different requester, extending the misconfiguration into a cache-based CORS attack.
