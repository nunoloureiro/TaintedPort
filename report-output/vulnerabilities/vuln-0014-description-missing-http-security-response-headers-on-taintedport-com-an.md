# Missing HTTP Security Response Headers on taintedport.com and api.taintedport.com (Clickjacking-Exploitable)

**ID:** vuln-0014
**Severity:** MEDIUM
**Found:** 2026-07-20 11:57:16 UTC
**Target:** https://taintedport.com and https://api.taintedport.com
**Endpoint:** All tested routes (frontend: /, /login, /admin, /checkout, /account; API: /wines, /wines/{id}, /auth/me)
**Method:** GET
**CWE:** CWE-1021
**CVSS:** 5.4 (CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N)

## Description

Neither the Next.js front-end at https://taintedport.com nor the PHP 8.2.31 API at https://api.taintedport.com sets any of the standard defence-in-depth HTTP response headers. Across eight endpoints tested on both hosts (`/`, `/login`, `/admin`, `/checkout`, `/account`, `/wines`, `/wines/1`, `/auth/me`) every one of the following headers was absent from every response — 64 of 64 header-check assertions failed:

- Content-Security-Policy (and Content-Security-Policy-Report-Only)
- Strict-Transport-Security
- X-Frame-Options (and no CSP `frame-ancestors` fallback)
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- Cross-Origin-Opener-Policy / -Resource-Policy / -Embedder-Policy

Because `X-Frame-Options` and CSP `frame-ancestors` are both missing, sensitive pages — including `/login`, `/admin`, and `/checkout` — can be embedded in a cross-origin `<iframe>`. This was verified live in a Chromium browser: an attacker-controlled page loaded from a cross-origin `data:` URL renders the production login page inside its iframe, enabling classic UI-redress (clickjacking) attacks against authenticated users.

Additional hardening headers being absent (HSTS, CSP, XCTO, Referrer-Policy, COOP/COEP/CORP) means the application also lacks any secondary containment against common browser-side threats.

## Attack Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MISSING SECURITY RESPONSE HEADERS                        │
│               taintedport.com  +  api.taintedport.com                       │
└─────────────────────────────────────────────────────────────────────────────┘

PREREQUISITES
  • Neither Cloudflare edge nor origin sets: CSP, HSTS, X-Frame-Options,
    X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/CORP.
  • Frontend stores JWT in localStorage (readable by any script on origin).
  • Victim is an authenticated user of taintedport.com.

┌──────────────┐          ┌───────────────────────┐          ┌───────────────┐
│  Attacker    │          │  Cloudflare + Origin  │          │   Victim      │
│  page        │          │  (no security         │          │   browser     │
│ (any origin) │          │   headers set)        │          │ (auth'd user) │
└──────┬───────┘          └───────────┬───────────┘          └───────┬───────┘
       │                              │                              │
       │ (1) Attacker crafts page:                                    │
       │     <iframe src="https://taintedport.com/login">             │
       │     + overlay "click for free wine"                          │
       │                                                              │
       │ (2) Victim visits attacker page (phishing / typo / ad) ─────▶│
       │                                                              │
       │                              │ (3) Browser fetches /login    │
       │                              │◀──────────────────────────────│
       │                              │                               │
       │                              │ (4) Response has NO           │
       │                              │     X-Frame-Options and NO    │
       │                              │     CSP frame-ancestors       │
       │                              │──────────────────────────────▶│
       │                                                              │
       │                                              (5) Browser renders
       │                                                  taintedport.com
       │                                                  /login INSIDE the
       │                                                  attacker's iframe
       │                                                  (proven: 1004x804
       │                                                  contentWindow!=null)
       │                                                              │
       │                                              (6) Victim clicks
       │                                                  "free wine" decoy —
       │                                                  click is actually
       │                                                  delivered to the
       │                                                  framed login /
       │                                                  checkout / admin
       │                                                  action underneath.
       │                                                              │
       │ (7) ─── UI-redress attack succeeds ─────────────────────────▶│
       │        (coerced login submission, coerced checkout,          │
       │         coerced admin action — all with victim's session)    │
       │                                                              │

DEFENSE-IN-DEPTH GAPS (verified 64/64 header checks failed)
┌────────────────────────────────────┬────────────────────────────────────────┐
│ Missing header                     │ Would prevent                          │
├────────────────────────────────────┼────────────────────────────────────────┤
│ X-Frame-Options / frame-ancestors  │ THE clickjacking above (demonstrated)  │
│ Content-Security-Policy            │ XSS → localStorage.token exfiltration  │
│ Strict-Transport-Security          │ First-visit SSL-strip on hostile Wi-Fi │
│ X-Content-Type-Options: nosniff    │ MIME-sniff on JSON responses           │
│ Referrer-Policy                    │ URL path leakage to third parties      │
│ Cross-Origin-Opener-Policy         │ Tabnabbing via window.opener           │
│ Permissions-Policy                 │ Unsolicited camera/mic/geo prompts     │
└────────────────────────────────────┴────────────────────────────────────────┘

ROOT CAUSE
  Neither the Cloudflare edge (no Transform Rule) nor the Next.js /
  PHP origins emit any defence-in-depth response header on any route.
  The single fix is a Cloudflare Transform Rule injecting the recommended
  header set on responses for both hosts.
```

## Impact

Directly demonstrated impact on the deployment as-is:

1. **Clickjacking of sensitive pages** — `/login`, `/admin`, and `/checkout` can be rendered inside a cross-origin iframe on an attacker-controlled page (verified live). An attacker who tricks an authenticated user into visiting the attacker page can overlay decoy UI ("click to claim your free wine") and steal clicks / keystrokes that are actually delivered to the framed application. Realistic outcomes include: coerced order placement on `/checkout`, coerced admin actions on `/admin`, and coerced authentication actions on `/login` (e.g. auto-login into an attacker-shared account for social-engineering follow-ups).

2. **Technology-stack disclosure** — the exact framework and PHP patch level are exposed on every response via `X-Powered-By`, narrowing the attacker's CVE-matching effort against known vulnerabilities in Next.js and PHP 8.2.31.

Indirect / conditional impact (documented but requiring another factor):

- The application stores its JWT in `localStorage`, and no `Content-Security-Policy` is enforced. Any reflected/stored XSS on the origin therefore automatically becomes full session hijacking. CSP is the standard containment for that scenario and is entirely absent.
- With no `Strict-Transport-Security`, first-visit users on hostile networks can be SSL-stripped by an on-path attacker before ever reaching Cloudflare's HTTPS redirect.
- Missing `Referrer-Policy` leaks URL paths (including identifiers such as `/admin/orders/{id}`) to third-party endpoints.
- Missing `X-Content-Type-Options: nosniff` on JSON API responses removes a browser defence against content-type confusion.
- Missing `Cross-Origin-Opener-Policy` leaves `window.opener` accessible for tabnabbing.

Business risk: the clickjacking primitive alone is sufficient for phishing and social-engineering attacks targeting authenticated users. The compounded absence of every other standard hardening header means every future XSS, network-attacker, or link-target concern has zero secondary containment.

## Technical Analysis

Both hosts are fronted by Cloudflare (`Server: cloudflare`, `Cf-Ray` present) and both origins reply with the same minimal header set on every route. Neither the Cloudflare edge (no Transform Rule for security headers appears active) nor the origin stacks (Next.js frontend, PHP 8.2.31 API) inject any of the following:

- Content-Security-Policy — no policy at all, so any successful XSS on the app executes with full DOM privileges. The client bundle stores the authentication JWT in `localStorage`, so it can be read by any script on the origin — CSP would be the primary containment for that class of compromise.
- Strict-Transport-Security — first-visit users on hostile networks (public Wi-Fi, captive portals) can be MITM-downgraded to plaintext HTTP before any server response is ever seen. Cloudflare's HTTPS redirect only helps users who already typed `https://`.
- X-Frame-Options and CSP `frame-ancestors` — both are missing. The browser will therefore embed any page on `taintedport.com` inside a cross-origin `<iframe>`. This was demonstrated in Chromium (see PoC): a cross-origin `data:` URL page loaded `https://taintedport.com/login` inside an iframe of 1004×804 CSS pixels. The Same-Origin Policy still blocks scripted access from the parent to the iframe's contentWindow (a `SecurityError` is thrown on `frame.contentWindow.location.href`), but SOP does not block rendering, click delivery, or keystroke delivery — which is what clickjacking requires. An attacker who can lure an authenticated user to a page under their control can overlay decoy UI on top of the framed login, admin, or checkout page and trick the user into performing unintended actions.
- X-Content-Type-Options — the JSON API responses are not marked `nosniff`, so any endpoint whose response can be forced into a document context is subject to MIME sniffing.
- Referrer-Policy — the browser default (`strict-origin-when-cross-origin` in modern browsers, but historically `no-referrer-when-downgrade`) is not enforced by the server, so full URLs (including `/admin/orders/{id}` paths and any query parameters) can leak in the `Referer` header to third-party endpoints, including Cloudflare's NEL reporting endpoint.
- Permissions-Policy — camera, microphone, geolocation, payment, and other powerful features are neither disabled nor scoped to `self`.
- Cross-Origin-Opener-Policy / -Resource-Policy — `window.opener` remains accessible from links to attacker pages, allowing tabnabbing-style redirection of the parent tab.

Additionally, `X-Powered-By: Next.js` (frontend) and `X-Powered-By: PHP/8.2.31` (API) are emitted on every response, disclosing the framework and specific PHP patch level to any client — unnecessary attack-surface information.

Root cause: no security-headers configuration exists at either the Cloudflare edge (no Transform Rule) or in the origin server config. Remediating at the edge is the fastest fix because it covers both hosts and every route uniformly.

## Proof of Concept

Two independent proofs — a header audit against 8 endpoints on both hosts, and a live Chromium demonstration of the clickjacking primitive.

**(A) Header audit (verify.py):**

    python3 poc/verify.py

Iterates over 8 endpoints on both hosts (`/`, `/login`, `/admin`, `/checkout`, `/account` on taintedport.com; `/wines`, `/wines/1`, `/auth/me` on api.taintedport.com) and inspects the response headers. Every check fails — 48/48 or 64/64 depending on whether COOP/CORP are counted — and the verdict `[VULNERABLE]` is printed.

**(B) Clickjacking demonstration (poc.py + evidence/clickjack.png):**

1. Build an HTML page containing a full-viewport `<iframe src="https://taintedport.com/login">` with an overlay `<div>` on top ("Click here for a free wine").
2. Load it in Chromium from a cross-origin URL (in this validation, a `data:text/html,...` URL — the browser treats every `data:` URL as an opaque origin, so this is definitively cross-origin to `taintedport.com`).
3. The iframe renders the live login page. `iframe.contentWindow` is non-null. A read to `iframe.contentWindow.location.href` throws `SecurityError` — Same-Origin Policy still blocks scripted introspection of the framed document. That is fine for the attacker: SOP does not prevent framing, click delivery, or key delivery, so the clickjacking primitive is achieved.
4. Screenshot is saved to `poc/evidence/clickjack.png` (1280×720 PNG).

The clickjacking demonstration can also be reproduced with `playwright-cli`:

    playwright-cli open
    playwright-cli goto 'data:text/html,<iframe src="https://taintedport.com/login" width=1000 height=800></iframe>'
    playwright-cli screenshot --filename=clickjack.png
    playwright-cli eval "() => { const f = document.querySelector('iframe'); return { hasFrame: !!f.contentWindow, w: f.offsetWidth, h: f.offsetHeight }; }"
    # -> { hasFrame: true, w: 1004, h: 804 }  — the iframe rendered.

Alternatively, the raw header absence is trivially observable via curl:

    curl -sI https://taintedport.com/login | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer|permissions|cross-origin'
    # (produces no output — every listed header is absent)

```
See poc_script_path
```

## Evidence

### 1. Frontend login page returns no defence-in-depth headers

**Request:**
```http
GET /login HTTP/1.1
Host: taintedport.com
Accept: text/html
```

**Response:**
```http
HTTP/1.1 200 OK
Cache-Control: s-maxage=31536000, stale-while-revalidate
Content-Type: text/html; charset=utf-8
Server: cloudflare
Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Accept-Encoding
X-Nextjs-Cache: HIT
X-Powered-By: Next.js

(HTML body omitted)
```

> No Content-Security-Policy, no Strict-Transport-Security, no X-Frame-Options, no X-Content-Type-Options, no Referrer-Policy, no Permissions-Policy, no COOP/COEP/CORP. X-Powered-By additionally discloses the framework.

### 2. API endpoint on api.taintedport.com - same missing set

**Request:**
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Origin: 
Content-Type: application/json
Server: cloudflare
X-Powered-By: PHP/8.2.31

(JSON body omitted)
```

> PHP 8.2.31 API - same absence of hardening headers. Content-Type is JSON but X-Content-Type-Options: nosniff is not set.

### 3. Automated audit - 64/64 required-header checks failed

**Request:**
```http
(verify.py - sends GET to 8 endpoints and inspects response headers)
```

**Response:**
```http
Header audit - 8 endpoints, 8 headers each
  [200] https://taintedport.com/            MISSING ALL
  [200] https://taintedport.com/login       MISSING ALL
  [200] https://taintedport.com/admin       MISSING ALL
  [200] https://taintedport.com/checkout    MISSING ALL
  [200] https://taintedport.com/account     MISSING ALL
  [200] https://api.taintedport.com/wines   MISSING ALL
  [200] https://api.taintedport.com/wines/1 MISSING ALL
  [401] https://api.taintedport.com/auth/me MISSING ALL
Total: 64/64 required-header checks failed
[VULNERABLE]
```

> Every checked endpoint on both hosts omits every checked header. Not a route-specific miss - the origin(s) and Cloudflare edge simply do not emit these headers anywhere.

### 4. Clickjacking primitive verified in-browser

**Request:**
```http
(attacker page loaded from cross-origin data: URL contains <iframe src="https://taintedport.com/login">)
```

**Response:**
```http
iframe.offsetWidth = 1004, offsetHeight = 804, contentWindow != null, cross-origin READ blocked by SOP (SecurityError). The <iframe> RENDERED the live login page; SOP only prevents scripted access, not framing or click delivery.
```

> This proves clickjacking of /login (and by extension /admin, /checkout - same origin, no XFO on any route) is possible. Screenshot saved to poc/evidence/clickjack.png.


## Remediation

Set the following headers on every HTML and JSON response from both `taintedport.com` and `api.taintedport.com`. The fastest path is a Cloudflare Transform Rule (Rules → Transform Rules → Modify Response Header) applied to `(http.host in {"taintedport.com" "api.taintedport.com"})`. The origin servers should also be configured so the protection persists if traffic is served without Cloudflare (e.g. private-origin health checks).

Recommended header set (adjust CSP `connect-src` if additional APIs are used):

    Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
    Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.taintedport.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self)
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Resource-Policy: same-site

Additional hardening steps:

1. **Roll CSP out with Content-Security-Policy-Report-Only first**, collect violations for 1-2 weeks, tighten to enforcement.
2. **Remove `X-Powered-By: Next.js`** - in `next.config.js` set `poweredByHeader: false`.
3. **Remove `X-Powered-By: PHP/8.2.31`** - set `expose_php = Off` in `php.ini`.
4. **Move the JWT out of `localStorage`** into an `HttpOnly; Secure; SameSite=Strict` cookie so XSS cannot exfiltrate it during any period before CSP is fully enforced.
5. **Submit the domain to the HSTS preload list** once `includeSubDomains; preload` is stable in production.
6. **If any legitimate embed use case exists**, replace `frame-ancestors 'none'` with an explicit allow-list rather than removing the directive.
7. **Automated regression test**: keep `poc/verify.py` (or equivalent) in CI so a future rollback of the Transform Rule is detected immediately.

## Conditions for Severity Increase

Severity rises to High if any of the following separately-reported issues is confirmed:

- A reflected or stored XSS on `taintedport.com`. Because CSP is absent and the JWT is stored in `localStorage`, any XSS immediately becomes full account impersonation via `localStorage.token` exfiltration. In that case Confidentiality/Integrity impact rises to High.
- A user visits `taintedport.com` for the first time on a hostile / captive-portal network. With no `Strict-Transport-Security` header on the apex, an on-path attacker can SSL-strip the initial navigation and inject arbitrary content into subsequent same-origin loads. Attack Vector effectively becomes Adjacent (network-hostile) with sharply higher C/I impact.
- Any endpoint under `taintedport.com` reflects a JSON payload whose Content-Type can be overridden by a browser MIME-sniff. Without `X-Content-Type-Options: nosniff`, that endpoint becomes an XSS vector via content-type confusion.
- A legitimate embed use-case is added and `frame-ancestors` is added with an over-permissive allow-list; clickjacking risk returns.
