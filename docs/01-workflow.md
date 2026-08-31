# POS / EPOS — End-to-End Transaction Workflow

**Phase 1 of 3** · Workflow design for a single-store retail business
**Status:** draft for review — feeds Phase 2 (HTML mockup) and Phase 3 (full-stack build)

---

## Scope & assumptions

| Area | Assumption |
|---|---|
| Business | One physical store, one or a few POS lanes, shared central catalog + inventory |
| Market | India-style retail: INR, tax classes (GST-like), **UPI as a first-class tender** alongside Cash and Card |
| Roles | **Cashier** (runs sales/returns), **Shift Manager** (approves overrides, signs off variance) |
| Payments | Modelled as integrated tender flows. Actual card/UPI gateway is **sandbox/mock** in the build — the workflow is real, the settlement is simulated |
| Inventory | Single stock-on-hand figure per SKU; sale decrements, approved resaleable return increments |
| Ledger | Every sale and refund posts a line: net amount, tax, tender, COGS. Refund posts the reversal |

---

## The workflow

```mermaid
flowchart TD

%% =====================================================
%% BRANCH 1 - MAIN SALE FLOW
%% =====================================================
subgraph SALE["BRANCH 1 - MAIN SALE FLOW"]
  direction TD
  S0(["Start: cashier logged in, till open"]) --> S1["Item Scan / Entry<br/>(barcode scan or manual SKU / PLU)"]
  S1 --> S2["Price Lookup<br/>(price + tax class from Product Catalog)"]
  S2 --> S3{"Item found?"}
  S3 -->|"No"| S3a["Reject line or manual price entry<br/>(manager override)"] --> S4
  S3 -->|"Yes"| S4["Add item to Cart<br/>(update line qty + running subtotal)"]
  S4 --> S5{"More items?"}
  S5 -->|"Yes"| S1
  S5 -->|"No"| S6["Apply Discount / Promotion<br/>(line-level + cart-level, if any)"]
  S6 --> S7{"Promo valid?<br/>(code, dates, min spend)"}
  S7 -->|"No"| S6
  S7 -->|"Yes"| S8["Calculate Tax<br/>(on post-discount amount, per tax class)"]
  S8 --> S9["Show Order Total<br/>(subtotal - discount + tax)"]
  S9 --> S10["Select Payment Method"]
  S10 --> S11{"Cash / Card / UPI?"}
  S11 -->|"Cash"| S12a["Enter tender amount<br/>-> compute change due"]
  S11 -->|"Card"| S12b["Authorise via card terminal / gateway"]
  S11 -->|"UPI"| S12c["Show UPI QR / collect request<br/>-> await confirmation"]
  S12a --> S13["Process Payment"]
  S12b --> S13
  S12c --> S13
  S13 --> S14{"Payment successful?"}
  S14 -->|"No"| S15["Decline handling<br/>(retry / switch method / void sale)"] --> S10
  S14 -->|"Yes"| S16["Print / email Receipt"]
  S16 --> S17["Decrement Inventory<br/>(stock-on-hand per SKU)"]
  S17 --> S18["Update Sales Ledger<br/>(net sale, tax, tender, COGS)"]
  S18 --> S19(["End: ready for next customer"])
end

%% =====================================================
%% BRANCH 2 - RETURNS / REFUND FLOW
%% =====================================================
subgraph RET["BRANCH 2 - RETURNS / REFUND FLOW"]
  direction TD
  R0(["Start: customer return request"]) --> R1["Verify Original Receipt<br/>(look up by receipt no. / txn ID)"]
  R1 --> R2{"Receipt found?"}
  R2 -->|"No"| R2a["Manager override<br/>(no-receipt: store credit only)"] --> R4
  R2 -->|"Yes"| R3{"Within return window?<br/>(e.g. 30 days)"}
  R3 -->|"No"| R3a(["Reject: outside policy"])
  R3 -->|"Yes"| R4["Inspect Item Condition"]
  R4 --> R5{"Item resaleable?"}
  R5 -->|"Yes"| R6a["Flag: restock"] --> R7
  R5 -->|"No"| R6b["Flag: write-off / damaged bin"] --> R7
  R7{"Approve / Reject Return<br/>(cashier, or manager if above limit)"}
  R7 -->|"Reject"| R7a(["Hand item back / End"])
  R7 -->|"Approve"| R8["Process Refund<br/>(match original tender)"]
  R8 --> R9{"Original tender?"}
  R9 -->|"Cash"| R10a["Cash refund from till"]
  R9 -->|"Card"| R10b["Card reversal / refund to original card"]
  R9 -->|"UPI"| R10c["UPI reversal to original VPA"]
  R10a --> R11{"Flagged for restock?"}
  R10b --> R11
  R10c --> R11
  R11 -->|"Yes"| R12["Increment Inventory<br/>(stock-on-hand per SKU)"]
  R11 -->|"No"| R12b["Post write-off adjustment"]
  R12 --> R13["Reverse Sales Ledger Entry<br/>(negative sale, adjust tax + COGS)"]
  R12b --> R13
  R13 --> R14["Print Refund Receipt"]
  R14 --> R15(["End"])
end

%% =====================================================
%% BRANCH 3 - CASH MANAGEMENT / END-OF-DAY FLOW
%% =====================================================
subgraph CASH["BRANCH 3 - CASH MANAGEMENT / END-OF-DAY FLOW"]
  direction TD
  C0(["Start: beginning of day / shift"]) --> C1["Till Opening<br/>(assign cashier, enter starting float, confirm count)"]
  C1 --> C2["Transactions Throughout Day"]
  C2 --> C3["Cash IN: cash sales"]
  C2 --> C4["Cash OUT: cash refunds"]
  C2 --> C5["Cash OUT: paid-outs / petty cash"]
  C2 --> C6["Cash OUT: safe drops / pay-ins"]
  C3 --> C7["Till Closing<br/>(end of shift / end of day)"]
  C4 --> C7
  C5 --> C7
  C6 --> C7
  C7 --> C8["Count Physical Cash<br/>(denomination breakdown)"]
  C8 --> C9["Compare vs. System-Recorded Total<br/>(expected = float + cash sales - refunds - paid-outs - drops)"]
  C9 --> C10{"Discrepancy within tolerance?"}
  C10 -->|"Yes"| C12["Generate End-of-Day Report<br/>(Z-report: sales, tax, tender mix, discounts, returns, variance)"]
  C10 -->|"No"| C11["Reconcile Discrepancy<br/>(recount, investigate, manager sign-off, log variance)"] --> C12
  C12 --> C13["Bank deposit / carry float forward"]
  C13 --> C14(["End of day"])
end

%% =====================================================
%% CROSS-BRANCH LINKS
%% =====================================================
S18 -.->|"feeds cash sales + tender mix"| C2
R13 -.->|"feeds cash refunds + returns total"| C2
C1 -.->|"till must be open"| S0
C1 -.->|"till must be open"| R0
```

---

## One-line explanation per branch

**Branch 1 — Main Sale Flow:** the cashier builds a cart item by item, the system prices and taxes it after any promotion, the customer pays by Cash / Card / UPI, and only on a successful payment does the POS print the receipt, decrement stock, and post the sale to the ledger.

**Branch 2 — Returns / Refund Flow:** a return is validated against its original receipt and return window, the item is inspected and approved, the refund is issued back on the *same* tender used to pay, and inventory plus the sales ledger are adjusted in reverse (restock or write-off).

**Branch 3 — Cash Management / End-of-Day Flow:** the till opens with a counted float, every cash movement in and out is tracked through the day, then at close the drawer is physically counted and compared to the system's expected figure, any variance is reconciled and signed off, and a Z-report closes the day.

---

## Key decision points & business rules

| # | Decision | Rule (default — configurable in Phase 3) |
|---|---|---|
| S3 | Item not found | Block the line; manager override allows a manual-price line item |
| S7 | Promo invalid | Reject code; sale continues at full price |
| S11 | Tender type | Cash / Card / UPI; split tender allowed (repeat S10–S14 per part) |
| S14 | Payment failed | Max 3 retries, then switch method or void the whole sale — nothing posts |
| R2 | No receipt | Manager override only; refund becomes **store credit**, never cash |
| R3 | Return window | 30 days from sale date |
| R5 | Item resaleable | Cashier judgement; sets the restock-vs-write-off flag |
| R7 | Approval limit | Cashier can approve up to ₹2,000; above that needs Shift Manager |
| R9 | Refund tender | Must match original tender; cash refund only if original was cash |
| C10 | Cash variance | Tolerance ±₹100; outside that triggers mandatory reconciliation + sign-off |

---

## What is real vs. simulated

| Real (modelled properly) | Simulated / mocked |
|---|---|
| Catalog lookup, pricing, tax-class calculation | Card terminal + UPI PSP — sandbox responses, no real settlement |
| Discount / promotion validation logic | Bank deposit step — recorded, not integrated |
| Inventory decrement / increment, write-off path | Receipt printer / email — preview + log, no hardware driver |
| Sales ledger postings and reversals | |
| Till float, cash movements, expected-vs-counted reconciliation, Z-report | |

---

## Next phase

Phase 2 turns this into a click-through **HTML/CSS/JS mockup** (vanilla + LocalStorage) with three tabs — **Sale**, **Returns**, **Till / Cash Management** — mirroring the three branches above so state persists across tabs like a real prototype.
