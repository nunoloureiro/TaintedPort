# Stateless JWTs Not Invalidated on Password or Email Change — Stolen Tokens Survive Credential Rotation (CWE-613)

**ID:** vuln-0018
**Severity:** MEDIUM
**Found:** 2026-07-20 12:08:27 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/password
**Method:** PUT
**CWE:** CWE-613
**CVSS:** 4.8 (CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N)

## Description

The API at `api.taintedport.com` authenticates every protected endpoint using stateless HS256 JWTs with a fixed 7-day lifetime and provides no server-side revocation primitive. The `PUT /auth/password` and `PUT /auth/email` flows update the underlying user record but do not invalidate any of the caller's previously-issued tokens. There is no server-side session store, no per-user token version counter, no `jti` denylist, and no `/auth/logout` endpoint (verified 404 on `/auth/logout`, `/auth/session`, `/auth/signout`).

Consequently, a JWT that reaches an attacker via any token-theft vector (localStorage XSS, mobile-client leakage, downstream MITM, or a signing-key/forgery compromise) remains fully authoritative against every protected endpoint for the entire remaining lifetime of the token — up to seven days — regardless of whether the legitimate user performs the standard "change my password / change my email" remediation.

This was independently confirmed with a fresh throw-away account: token A obtained at registration and token B obtained by logging in both continue to authenticate `GET /auth/me`, `GET /cart`, and `GET /orders` after a successful password rotation *and* after a subsequent email rotation. Notably, the server returns the user record based purely on the `user_id` claim; the `email` claim inside the JWT is not cross-checked against the database, so a token whose `email` claim contains the old address is still honored even though the account's stored email has changed.

## Attack Flow

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

## Impact

Standard account-recovery remediation is inoperative. A user who suspects compromise and changes their password (or password + email + 2FA) has no way to eject a live attacker: the attacker's token continues to authenticate every protected endpoint on the API for up to seven days. Recovery requires either waiting for the token to expire, or rotating the HS256 signing secret globally (which forcibly signs out every user in the system, not just the compromised account).

In isolation this is a session-management weakness — an attacker must already possess a valid JWT via a separate primitive. Chained with any token-theft vector already present on this host (XSS against localStorage-stored tokens, a JWT signing/forgery flaw, mobile-client leakage), this weakness converts a transient compromise into a durable one. The customer-visible consequence is that after any real-world token compromise the account is effectively unrecoverable through user-facing controls for the remaining life of the token.

Data at risk during the residual window includes the account's PII (`/auth/me`), cart contents (`/cart`), and full order history (`/orders`, `/orders/{id}`), as well as any state-changing capability those endpoints permit.

## Technical Analysis

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

## Proof of Concept

1. Create a throw-away account: `POST /auth/register` with a random email and password. Capture the `token` field in the response — call this `token_A`.
2. Log in with the same credentials via `POST /auth/login`. Capture the `token` field — call this `token_B`. (Both `token_A` and `token_B` are independent bearer credentials, both scoped to `user_id=492`, both with 7-day exp.)
3. Confirm the baseline: `GET /auth/me` with `Authorization: Bearer <token_A>` → HTTP 200.
4. Change the account password: `PUT /auth/password` with `Authorization: Bearer <token_B>` and body `{"current_password":"<old>","new_password":"<new>"}` → HTTP 200 `"Password changed successfully."`
5. Immediately reissue the request from step 3 using `token_A` (issued *before* the password change): `GET /auth/me` with `Authorization: Bearer <token_A>` → **HTTP 200** with the user record. Same result for `GET /cart` and `GET /orders`.
6. Change the account email: `PUT /auth/email` with `Authorization: Bearer <token_B>` and body `{"password":"<new>","new_email":"<...>"}` → HTTP 200 `"Email updated successfully."` (response also contains a fresh token).
7. Reissue `GET /auth/me` with `token_A` one more time → **HTTP 200**. The returned `user.email` is the *new* email, while `token_A`'s `email` claim contains the *old* email — confirming the server authenticates on `user_id` only.
8. Attempt to invalidate the token via any standard logout path: `POST /auth/logout`, `GET /auth/logout`, `DELETE /auth/session`, `POST /auth/signout` — all return HTTP 404. No server-side revocation is possible.

```
See poc_script_path.
```

## Evidence

### 1. Register account — server returns token_A (JWT with 7-day exp)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"V","email":"valpoc+e02eb7ea22@example.com","password":"InitialPw123!"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"<token_A>"}
```

> token_A payload decodes to {user_id:492, email:..., is_admin:false, iat:1784549071, exp:1785153871} — exp-iat = 604800s (7 days). No jti, no version claim.

### 2. Login the same account — server issues token_B

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"valpoc+e02eb7ea22@example.com","password":"InitialPw123!"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"<token_B>"}
```

> token_A and token_B are independent bearer credentials. Both must be individually invalidated on credential change; neither will be.

### 3. token_A authenticates GET /auth/me BEFORE any change

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":492,"name":"V","email":"valpoc+e02eb7ea22@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 12:04:31"}}
```

> Baseline — token_A works as expected.

### 4. Legitimate password change via token_B

**Request:**
```http
PUT /auth/password HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_B>
Content-Type: application/json

{"current_password":"InitialPw123!","new_password":"ChangedPw456!"}
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"message":"Password changed successfully."}
```

> Password successfully rotated in the database. Server does NOT bump any token version, does NOT clear any session store — because none exists.

### 5. token_A (issued BEFORE the password change) still authenticates /auth/me

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":492,"name":"V","email":"valpoc+e02eb7ea22@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 12:04:31"}}
```

> *** VULNERABILITY *** — password rotation had no effect on the previously-issued token. A stolen JWT survives the user's remediation.

### 6. token_A also authenticates other protected endpoints

**Request:**
```http
GET /cart HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>

---
GET /orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

**Response:**
```http
HTTP/1.1 200 OK
{"success":true,"items":[],"total":0}

---
HTTP/1.1 200 OK
{"success":true,"orders":[]}
```

> The stolen token retains full authorization across the API surface, not just /auth/me.

### 7. User escalates remediation — email change via token_B

**Request:**
```http
PUT /auth/email HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_B>
Content-Type: application/json

{"password":"ChangedPw456!","new_email":"changed+131f6bab@example.com"}
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"message":"Email updated successfully.","token":"<fresh_token>"}
```

> Server returns a fresh token in the response — hinting at intended rotation — but does not revoke the previous tokens.

### 8. token_A still authenticates AFTER both password AND email change

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <token_A>
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":492,"name":"V","email":"changed+131f6bab@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 12:04:31"}}
```

> *** VULNERABILITY *** — full remediation flow (password + email) is bypassed. Note the returned user.email is the NEW email, yet token_A's email claim is the OLD one — the server authenticates on user_id only and does not cross-check the email claim against the DB.

### 9. No /auth/logout endpoint exists (4 candidate paths tested)

**Request:**
```http
POST /auth/logout   ---   GET /auth/logout   ---   DELETE /auth/session   ---   POST /auth/signout
```

**Response:**
```http
HTTP/1.1 404 Not Found (all four)
```

> There is no server-side revocation primitive at all. Recovery requires either waiting up to 7 days for exp, or rotating the JWT signing secret globally (which would invalidate every user's session).


## Remediation

1. Introduce a per-user monotonic counter on the `users` row (e.g. `token_version INTEGER NOT NULL DEFAULT 0`). Embed the value as a `tv` claim in every issued JWT. In the authentication middleware, after signature verification, reject the token if `claim.tv != user.token_version`.
2. Increment `token_version` as a side effect of every operation that should invalidate outstanding sessions: password change, email change, 2FA enable/disable, admin-forced signout, account deactivation, and (see below) explicit user logout.
3. Add a real `POST /auth/logout` endpoint that increments `token_version` (or, if a denylist is preferred, writes the `jti` of the presented token to a short-lived denylist store keyed to the token's remaining lifetime).
4. Shorten the JWT lifetime from 7 days to a value proportional to the sensitivity of the actions the token permits (15 minutes is typical for an access token) and issue a rotating refresh token that IS server-side revocable — so a full-lifetime revocation is always available.
5. On `PUT /auth/password` and `PUT /auth/email`, respond with a fresh token (as is already done for the email endpoint) and encourage clients to replace the old one. This is a usability improvement — not the security control. The security control is the server-side rejection from step 1.
6. Cross-check `email` (and any other identity-bearing claim) against the database on every request, or drop the claim from the token entirely to avoid stale-data confusion.
7. Deployment step: after shipping the fix, invalidate every currently-issued JWT by bumping `token_version` for all users (or rotating the HS256 signing secret) to close the window during which tokens were issued under the vulnerable design.

## Conditions for Severity Increase

Exploitation requires the attacker to have obtained a valid JWT for the target account through a separate primitive (this finding is the persistence multiplier, not the initial-access vector). If chained with any token-theft or token-forgery vulnerability present on the same host — e.g. XSS against tokens stored in `localStorage`, mobile-client leakage of the bearer token, downstream MITM, or a JWT signing-key/forgery finding — the attack complexity drops from H to L. Under that chained condition the CVSS becomes AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N = 6.5 (Medium). Additionally, if the account being hijacked is an administrator, `is_admin=true` in the token grants full administrative reach for the residual 7-day window, escalating C and I to H and pushing the chained score into High.
