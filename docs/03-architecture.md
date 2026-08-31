# Architecture Walkthrough

A guided tour of the Phase 3 app for someone who wants **product-manager-with-dev-knowledge**
depth: enough to read the code, reason about trade-offs, and hold a credible
conversation with engineers — without needing to have written it.

---

## 1. The shape of the system

```
Browser (React SPA)
   │  HTTP, JSON, "Authorization: Token <key>"
   ▼
nginx  (frontend container, port 80 -> host 8091)
   │  serves the built React files
   │  proxies  /api/*  and  /admin/*  to ->
   ▼
gunicorn -> Django + Django REST Framework   (backend container, 8000 -> host 8001)
   │  ORM
   ▼
PostgreSQL 16   (db container, 5432 -> host 5434)
```

The browser only ever calls **one origin** (`:8091`). nginx decides what is a
static file and what is an API call. This is why there is no CORS problem in
normal use — everything is same-origin.

**Why three containers, not one:** the frontend and backend are built, versioned
and scaled independently. It also mirrors reality — the "two builds" a full-stack
project actually has.

---

## 2. Data model

All tables, by app. Money columns are integer **paise** (₹1 = 100 paise) — never
floats, so totals are exact.

### `catalog`
| Model | Purpose | Notes |
|---|---|---|
| `Category`, `Brand` | reference lists | — |
| `Style` | a garment design | holds `mrp_paise` (the **tag price**, GST-inclusive), `hsn`, optional `tax_rate_override` |
| `Variant` | **one sellable unit** = Style × size × colour | has the `barcode`, the `stock` figure, `is_sellable`. `unique_together(style, size, color)` |
| `StockMovement` | append-only ledger of every stock change | `delta` (signed), `reason` (SALE / RETURN / RECEIVE / WRITE_OFF / …), `ref`, `created_by`. The sum of deltas *is* the stock. |
| `Promotion` | a till-time discount rule | flat `percent` off a `scope` (ALL / CATEGORY / BRAND / STYLES) inside a date window, optional `max_discount_paise` cap |

The apparel-specific idea: **a shirt is not one SKU**. `Style` → many `Variant`.
Reporting rolls Variant → Style → Category. Search hits any of barcode / style
code / name / colour.

### `sales`
| Model | Purpose |
|---|---|
| `Sale` + `SaleLine` | a completed transaction. Lines store the price, discount, promo name, tax rate and tax **as they were at the time** (denormalised — a later price change must not rewrite history). `SaleLine.returned_qty` tracks what has come back. |
| `Payment` | one tender leg of a sale (CASH / CARD / UPI / STORE_CREDIT). A sale can have several. |
| `ReturnTxn` + `ReturnLine` | a return **or** an exchange. For an exchange it also points at `exchange_sale` — a brand-new `Sale` for the replacement items. `refund_amount_paise` / `collect_amount_paise` capture the money direction. |

**Immutability rule:** a `COMPLETED` sale is never edited or deleted. A return
bumps `returned_qty`, writes a `ReturnTxn`, and recomputes the sale's status
(`PARTIALLY_RETURNED` / `RETURNED`). This is what an auditor expects.

### `till`
| Model | Purpose |
|---|---|
| `TillSession` | one drawer, opened with a counted float, closed with a blind count → `expected` / `counted` / `variance` / `signed_off_by` |
| `CashMovement` | every cash in/out: CASH_SALE, CASH_REFUND, EXCHANGE_COLLECT, PAID_OUT, SAFE_DROP. `signed_paise` gives the drawer effect. |

### `core`
`Sequence` — a row-locked counter for gap-free document numbers
(`INV-YYYYMMDD-0001`, `RET-…`).

---

## 3. The pricing engine  (`catalog/pricing.py`)

Pure functions, no DB writes — easy to test, easy to trust. Per cart line:

1. `gross = unit_price × qty` — the MRP is **GST-inclusive**, so this is a
   tax-inclusive number.
2. `best_promo_for(style, today)` — highest-percent promotion that is active,
   in its date window, and in scope.
3. `discount = round(gross × percent/100)`, capped by the promo.
4. `net = gross − discount` — what the customer pays.
5. Back the tax out: `taxable = round(net × 100 / (100 + rate))`, `tax = net − taxable`.
   `rate` is **5% or 12%** depending on the per-piece value (the well-known
   apparel GST rule; `Style.tax_rate_override` wins if set).

Totals: `subtotal = Σ gross`, `discount = Σ line discount`, `tax = Σ line tax`,
`total = Σ net`. Tax is also grouped by rate for the receipt.

**Price change vs promotion** — a permanent markdown lowers `Style.mrp_paise`
(and the shop re-tags). A promotion is a rule applied here at step 2. They never
touch each other; margin reporting stays clean. (The seed's *Floral Midi Dress*
is already marked down from ₹1,999 → ₹1,499, and *also* carries a 40% EOSS
promotion — you can see both in the cart.)

---

## 4. The three transaction flows

### Checkout — `sales/services.checkout()`
Runs inside **one `@transaction.atomic` block**:

1. `SELECT … FOR UPDATE` on the cart's variant rows — locks them so two tills
   can't sell the same last piece.
2. validate sellable + enough stock.
3. price the cart with the engine.
4. check the payments sum **exactly** equals the total.
5. write `Sale` + `SaleLine`s + `Payment`s.
6. for each line: `stock -= qty` and write a `StockMovement(SALE)`.
7. if a cash payment and a till is open: `CashMovement(CASH_SALE)`.

If anything raises, the whole thing rolls back — no half-sale, no phantom stock
change.

### Returns & exchanges — `sales/services.process_return()`
Also fully atomic. Highlights:

- **Return-window** check (30 days) — outside it needs a manager or an explicit
  override.
- **Approval gate** — return value over ₹2,000 by a non-manager needs an
  `approved_by` manager.
- Value each returned line **proportionally**: `line_total × qty / original_qty`.
- Bring stock back: `RESALEABLE` → `+qty` + `StockMovement(RETURN/EXCHANGE_IN)`;
  `DAMAGED` → no restock, a zero-delta `WRITE_OFF` movement for the audit trail.
- **Refund:** `refund_amount = returned_value`, to the original tender (or store
  credit). Cash → `CashMovement(CASH_REFUND)`.
- **Exchange:** build a quote for the replacement items, create the
  `exchange_sale`, decrement its stock. The returned goods are a
  `STORE_CREDIT` "trade-in" payment on that sale. Then:
  `diff = exchange_total − returned_value` → `> 0` collect the difference,
  `< 0` refund it, `= 0` even swap, no money moves.

### Cash-up — `till/services.close_session()`
`expected = float + Σ(inflows) − Σ(outflows)`. The cashier enters a **blind**
count. `variance = counted − expected`. Outside ±₹100 → a reason **and** a
manager sign-off are required before the `Z-report` (`z_report()`) is produced:
transactions, gross, discounts, refunds, GST, tender mix (net of refunds),
drawer expected/counted/variance.

---

## 5. Auth

DRF `TokenAuthentication`. `POST /api/auth/login` returns a token; the SPA stores
it in `localStorage` and sends `Authorization: Token <key>` on every call.
`accounts.User` is a custom user with a `role` (`associate` / `manager`);
`user.is_manager` drives the approval gates. Simple and sufficient for a
single-store terminal; a real deployment would likely move to short-lived JWTs
or session cookies with CSRF.

---

## 6. How it's packaged (`docker-compose.yml`)

- **db** — `postgres:16-alpine`, named volume `pgdata`, healthcheck so the
  backend waits for it.
- **backend** — the `Dockerfile` installs deps and runs `entrypoint.sh`:
  `makemigrations` → `migrate` → `collectstatic` → `seed` → `gunicorn`.
- **frontend** — multi-stage: `node` builds the React app, then the static files
  are copied into `nginx:alpine` with `nginx.conf` (SPA fallback + `/api` proxy).

---

## 7. Deliberate simplifications (and what production would do)

| In this project | Production |
|---|---|
| `makemigrations` at container start | migrations committed, reviewed, run in a release step |
| gunicorn sync workers, `DEBUG=true` | gevent/uvicorn workers, `DEBUG=false`, real `SECRET_KEY`, HTTPS |
| Payments are simulated in the UI | integrate one PSP behind the existing `Payment` seam; handle async UPI via webhook |
| Token auth, permissive CORS | JWT/session + CSRF, locked-down origins |
| One open `TillSession` at a time | per-drawer sessions, cashier handover |
| Seed data on every boot | seed once; master data syncs from the ERP (CSV in v1, API in v2) |
| Single store | multi-store with central price/promo push (v2 in the brief) |

None of these are accidental — they are the v1 scope calls from
[02-product-brief.md](02-product-brief.md), section 6.2 and 7.

---

## 8. Where to look first

| You want to understand… | Read |
|---|---|
| the money maths | `backend/catalog/pricing.py` |
| a sale being committed | `backend/sales/services.py` → `checkout()` |
| exchange-vs-refund logic | `backend/sales/services.py` → `process_return()` |
| cash reconciliation | `backend/till/services.py` |
| the data shape | `backend/*/models.py` |
| the API surface | `backend/*/urls.py` (+ open http://localhost:8001/api/ in a browser while logged in) |
| the screens | `frontend/src/screens/*.jsx` |
