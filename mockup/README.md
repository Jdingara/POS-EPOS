# POS / EPOS — Click-through Mockup

**Phase 2 of 3.** A single-file, vanilla HTML/CSS/JS prototype that turns the
[Phase 1 workflow](../docs/01-workflow.md) into a clickable terminal. It is the
requirement spec for the Phase 3 full-stack build — every screen, field, and rule
here is meant to be recreated against real APIs.

## Run it

Open `index.html` in any modern browser. No build, no server, no dependencies.
(For `file://` some browsers restrict `localStorage`; if so, serve the folder —
e.g. `npx serve mockup` — and open `http://localhost:3000`.)

## What it covers

| Tab | Workflow branch | Implemented |
|---|---|---|
| **Sale** | Branch 1 | Barcode/SKU/name lookup, catalog grid, cart with qty + stock guard, promo codes with live recalculation, per-tax-class tax, Cash / Card / UPI with mock confirmation, receipt preview + print, inventory decrement, ledger entry |
| **Returns** | Branch 2 | Receipt lookup, return-window check + manager override, per-line return qty, resaleable vs damaged, cashier approval limit, refund on the original tender, inventory increment / write-off, refund receipt |
| **Till / Cash** | Branch 3 | Opening float, cash movements (sales, refunds, paid-outs, safe drops), expected-in-drawer, denomination count, expected-vs-counted variance with tolerance + manager sign-off, Z-report (Z-report: gross, discounts, returns, tax, tender mix, variance), day close |

## State

Everything persists in `localStorage` under the single key `pos_db_v1`
(catalog, promos, cart, sales, refunds, till, sequences). State survives page
reloads and is shared across the three tabs. **Reset demo data** in the header
restores the seed.

## Seed data

- 12 products across 3 tax classes — `STD` 18%, `RED` 5%, `ZERO` 0%
- Promo codes: `WELCOME15` (15%, no min), `SAVE10` (10%, min ₹500),
  `FLAT50` (₹50 off, min ₹300), `OLD20` (inactive — demonstrates rejection)
- Staff: Asha (Manager), Ravi (Cashier), Meena (Cashier) — role drives the
  refund approval limit (₹2,000)

## Try these scenarios

1. **Happy-path sale** — Till tab → *Open till* (float ₹2000) → Sale tab → add
   items → apply `SAVE10` (needs ≥ ₹500) → *Cash* → tender ₹1000 → receipt.
2. **Declined card** — add an item → *Card* → *Declined* → sale stays open,
   nothing posts; retry with *UPI*.
3. **Partial refund** — Returns tab → pick the recent receipt → return 1 of 2 of a
   line → *Process refund*; check stock went back up on the Sale tab.
4. **Cash-up with a variance** — Till tab → record a *Paid-out* → *Close till &
   count* → enter denominations that don't match → reconciliation box appears →
   add a reason + sign-off → *Generate end-of-day report*.

## Known simplifications (intentional for a mockup)

- Payments are simulated — no gateway, no settlement.
- Single store, single drawer, no multi-lane or offline queue.
- Split tender is described in the workflow but not wired in this prototype.
- Tax is a flat rate per class (no HSN-level GST breakdown / CGST-SGST split).
