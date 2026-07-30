# Missing Anti-Automation on /auth/login Combined with Account Enumeration via Timing and Registration Oracles

**ID:** vuln-0020
**Severity:** MEDIUM
**Found:** 2026-07-20 12:13:55 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/login
**Method:** POST
**CWE:** CWE-307
**CVSS:** 6.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N)

## Description

The authentication surface at `https://api.taintedport.com/auth/*` exposes two independent weaknesses that combine to enable credential stuffing and targeted password guessing.

1. **`POST /auth/login` has no anti-automation controls.** Thirty consecutive failed login attempts against a real account from the same client IP completed in ~5.5 seconds (5.4 req/s). Every response was HTTP 401 with an identical body, no progressive delay, no lockout, no CAPTCHA, and no HTTP 429/423. Immediately after the burst the correct credential still authenticated (HTTP 200), so the account is not locked. Cloudflare fronts the host but did not present a challenge.

2. **Two orthogonal account-enumeration oracles are present.**
   - **Timing oracle on `POST /auth/login`.** Valid emails take ~1.65× longer than invalid ones because bcrypt password verification runs only when the account row exists. Fifteen interleaved samples measured medians of 180 ms (valid) vs 108 ms (invalid) — a 72 ms delta clearly distinguishable over a WAN.
   - **Registration oracle on `POST /auth/register`.** Existing accounts return HTTP 409 with the exact string `"Email already registered."`; fresh addresses return HTTP 201 with a bearer token. No authentication required.

Combined, an unauthenticated attacker can (a) enumerate which emails from an arbitrary candidate list are real accounts (via either oracle), then (b) run credential-stuffing or dictionary attacks against those confirmed accounts at ~5 requests/second per source with no throttling, blocking, or challenge.

## Attack Flow

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

## Impact

**Confidentiality — direct.** Any attacker with a candidate email list can determine which addresses correspond to real accounts on this application, with no authentication. This is a privacy leak in itself (membership disclosure) and dramatically improves the yield of subsequent attacks by filtering out non-existent targets.

**Confidentiality / Integrity — indirect via credential stuffing.** The absence of any rate-limit, lockout, or CAPTCHA on `/auth/login` means once an attacker has an enumerated set of real accounts, they can automate the replay of leaked credential dumps (Have I Been Pwned, RockYou, ComboLists, etc.) at ~5 req/s per source, ~432,000 attempts/day per source, with parallelism scaling linearly. Given the industry baseline of ~80 % password reuse, this reliably yields account takeover of the affected users. Once inside, the attacker inherits the full permissions of the compromised user (personal data access, session token issuance, any state-changing actions available to that role).

**Business impact.** Enables targeted account-takeover campaigns against any user of the platform whose credentials appear in any public breach. Because Cloudflare is not enforcing a rate limit here either, campaign detection depends entirely on origin-side telemetry that is not currently present.

## Technical Analysis

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

## Proof of Concept

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

```
See poc_script_path.
```

## Evidence

### 1. Burst brute-force — 30 failed logins in ~5.5 s, no lockout, no 429

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"BadPass!0Zzz-a1b2c3"}

(repeated 30× with different wrong passwords in a tight loop)
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Login failed for luis.grangeia@snyk.io. Please check your credentials."}

(all 30 responses identical, total wall time ~5.5 s, no HTTP 429/423 anywhere in the sequence)
```

> No throttling, no lockout, no CAPTCHA/Turnstile challenge. Sustained rate ~5.4 req/s from an unprivileged client — ~470k attempts/day/source scales linearly with parallelism.

### 2. Account is NOT locked — correct password still works immediately after the burst

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"<correct password>"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Login successful","token":"eyJhbGciOi..."}
```

> Confirms there is no per-account lockout counter — the burst does not degrade the legitimate user's experience because there is no counter to degrade.

### 3a. Timing oracle — request for a KNOWN email (bcrypt runs, ~180 ms median)

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"x"}

(15 samples, interleaved with step 3b)
```

**Response:**
```http
HTTP/1.1 401 Unauthorized

{"success":false,"message":"Login failed for luis.grangeia@snyk.io. Please check your credentials."}

Elapsed median: 180 ms
```

> bcrypt.verify runs because the user row exists. Elapsed time reflects the ~70 ms bcrypt-cost-10 verification even though the credential is wrong.

### 3b. Timing oracle — request for an UNKNOWN email (fast path, ~108 ms median)

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"nope-<random>@no-such-domain-x.example","password":"x"}

(15 samples, interleaved with step 3a)
```

**Response:**
```http
HTTP/1.1 401 Unauthorized

{"success":false,"message":"Login failed for nope-<random>@no-such-domain-x.example. Please check your credentials."}

Elapsed median: 108 ms
```

> No user row → no bcrypt call → 72 ms faster than the valid-email path. Δ 72 ms, ratio 1.65×. Reproducible across runs. Response body is identical apart from the reflected email.

### 4a. Registration oracle — existing email returns a direct textual leak

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"X","email":"luis.grangeia@snyk.io","password":"Password123!"}
```

**Response:**
```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{"success":false,"message":"Email already registered."}
```

> Direct one-request oracle: response body reveals that the account exists. No auth required. Trivial to script against a candidate list.

### 4b. Registration oracle — fresh email registers successfully and returns a token

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"X","email":"probe-<random>@probe-<random>.example","password":"Password123!"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

> The two responses (409 vs 201) form a clean, unambiguous membership oracle. Combined with the timing oracle they are mutually reinforcing — no single mitigation closes both.


## Remediation

1. **Enforce per-account failed-login throttling** on `POST /auth/login`. Lockout or exponential-backoff after a small number (e.g. 5) of failures within a time window (e.g. 15 minutes). Track by `user_id` when the email resolves, and by client IP when it does not — so the attacker cannot use a bogus email to sidestep the counter.
2. **Add per-IP request-rate limiting** on `/auth/login`, `/auth/register`, and any other credential- or identity-touching endpoint (e.g. `/auth/password`). This can be implemented at the edge in Cloudflare Rate Limit Rules without code changes; the origin should still enforce its own limits as defense-in-depth.
3. **Equalise timing on `/auth/login`.** When the user lookup misses, still perform a bcrypt verify against a fixed dummy hash of the same cost, so the failed-lookup and failed-password paths take the same time. Use `hmac.compare_digest` (or bcrypt `checkpw` with a sentinel hash) — never short-circuit before crypto.
4. **Fix the registration oracle.** Return a generic response regardless of whether the address existed (e.g. HTTP 200 `"If your address is not already registered, we've sent you a verification link."`) and gate real account creation behind the email-verification step. Do the same for password-reset requests.
5. **Suppress the submitted email in error messages** on `/auth/login`. Return a fixed string such as `"Invalid email or password."` — never reflect user-controlled input in the error body. Removes a latent reflected-XSS sink and reduces the information leak.
6. **Add CAPTCHA / Turnstile** as an escalation after N failed attempts from the same IP or on the same account (Cloudflare Turnstile is already available on the fronting CDN).
7. **Alert and observability.** Log failed-login rates per account and per IP; alert on anomalous spikes so credential-stuffing campaigns are detected in near-real-time even if they slip below the throttling threshold.

## Conditions for Severity Increase

Severity would increase if any of the following occurs:

- **A credential-stuffing campaign succeeds against even one privileged account.** Because `/auth/register` allows setting `is_admin` at registration time (separate finding), any successful takeover on an admin/staff account would raise Confidentiality and Integrity to H and Scope may become C (Changed).
- **The 401 error message ("Login failed for <email>...") is rendered as HTML in any downstream surface** (support-desk UI, admin dashboard, notification email). The email field is currently reflected verbatim; if it ever reaches an HTML sink, the finding gains a reflected-XSS chain and severity rises.
- **Cloudflare's edge protection is removed or misconfigured**, uncovering the origin. The current 5 req/s ceiling is a network artefact, not an application control; if the origin becomes directly reachable, throughput and therefore exploit velocity increase significantly.
- **A large-scale password dump referencing this application appears in a public breach corpus.** The application's lack of throttling means such a dump becomes immediately weaponisable without any additional discovery work.
