# Product Brief — Apparel Retail POS / EPOS

**Phase 2 deliverable (product track).** A mini-PRD for a fashion & apparel
point-of-sale system for single-store retailers, with a rollout path to chains.

| | |
|---|---|
| **Author** | Sasi Kumar R |
| **Status** | Draft for review |
| **Related** | [01-workflow.md](01-workflow.md) (process model) · [../mockup/index.html](../mockup/index.html) (click-through prototype) |
| **Prototype status** | Working prototype covers checkout / returns / till. Payments are sandbox. Variant catalog + exchange flow are the next prototype iteration (see Appendix A). |

---

## 1. TL;DR

Independent and small-chain **apparel retailers** run the shop floor on a mix of
legacy billing software, spreadsheets, and manual registers. That software was
built for generic retail — it treats a shirt as one SKU, has no real concept of a
**size/colour exchange**, and makes seasonal markdowns and end-of-day cash
reconciliation a manual chore.

This product is a **fashion-first POS**: the catalog is a style → size × colour
**variant matrix**, returns default to **exchange** (retain the sale, keep stock
accurate), promotions understand **seasonal % markdowns by category / brand /
collection**, and the day closes with a **blind cash count** reconciled against
the system into a GST-compliant Z-report.

**v1 is one store**: sell, exchange, reconcile, report — done well. Multi-store,
loyalty, richer promos, and omnichannel are deliberately deferred.

---

## 2. Problem & context

Apparel retail has characteristics that generic POS handles badly:

| Characteristic | Why generic POS struggles |
|---|---|
| **Variant explosion** — one style is 10–40 sellable units (size × colour) | Catalogs modelled as flat SKUs make lookup, stock, and reporting painful; associates can't find "the 40 in olive" fast |
| **High return / exchange rate** — fit and size are guesswork | Return flows assume "refund to card"; the common case (same style, one size up) needs a **return + re-sale in one step, no cash moved** |
| **Markdown-driven pricing** — full price → seasonal sale → EOSS → clearance | No clean split between a **price change** (the tag price is now lower) and a **promotion** (a rule applied at the till); margin reporting gets muddy |
| **Seasonality** — collections, size curves, sell-through by size | POS data doesn't roll variant → style → category → season, so buying decisions fly blind |
| **Compliance** — GST invoice, tax-inclusive MRP, HSN per line | Bolt-on tax handling, rounding errors, non-compliant invoice formats |

**Who feels it:** the store associate (slow billing, clumsy exchanges), the store
manager (manual day-close, discount leakage, stock that doesn't match the ERP),
and HQ merchandising/finance (no timely sell-through or return-reason data).

**Why now:** UPI has made integrated digital payments cheap and standard in
India; Android tablet hardware is inexpensive; and small apparel chains are
professionalising operations post-pandemic. The back-office ERP layer for
garments is mature — the gap is a **front-of-house transaction system that speaks
the same language**.

---

## 3. Goals & non-goals

**Goals**
- Bill an apparel basket accurately and fast: right variant, right price, right GST, right promotion.
- Make **size/colour exchange** a first-class, one-transaction flow.
- Apply seasonal markdowns and category promotions **consistently and automatically** at the till.
- Close the day with cash controlled and a compliant Z-report, with variances explained.
- Keep store inventory trustworthy at the **variant** level.

**Non-goals (this product / this phase)**
- Not a merchandise-planning, allocation, or size-curve buying tool (that's the ERP/planning layer — this *feeds* it).
- Not an e-commerce platform or an OMS.
- Not a full CRM / loyalty engine in v1.
- Not a warehouse/DC system.

---

## 4. Personas

| Persona | Role | Primary goals | Frustrations today |
|---|---|---|---|
| **Priya — Sales Associate** | Runs the till, helps on the floor | Fast billing; quick size swap; never be short at cash-up | Barcode won't scan and manual lookup is slow; promo rules unclear; waits for a manager to approve every discount |
| **Rahul — Store Manager** | Owns store P&L, staff, day-close | Accurate, quick day-close; control discounts & markdowns; stock that matches the ERP | Reconciliation is manual; discount abuse; stock drift; no quick view of what's selling |
| **Sunil — Area / Retail Ops Manager** | 8–15 stores | Consistent pricing & promos everywhere; compare store performance; limit cash risk | Every store improvises; sales data arrives days late |
| **Anjali — Merchandising / Buying (HQ)** | Decides what to stock | Sell-through by style/size/colour; return reasons; markdown effectiveness | POS data doesn't roll up by variant or capture *why* things come back |
| **Meena — Finance / Accounts (HQ)** | GST filing, banking, audit | Clean tender reconciliation; compliant invoices; audit trail | Manual tallying across stores; format errors; unexplained variances |
| **Customer** | Shopper | Fast checkout; painless size exchange; till price matches the tag | Long queues; "you can only get store credit"; price surprises |

**Persona focus for v1:** Priya and Rahul. Sunil, Anjali, and Meena are
**data consumers** in v1 (they get the Z-report and CSV exports); their tooling
is v2+.

---

## 5. Jobs to be done

1. **When** a customer brings garments to the counter, **the associate wants to**
   bill the exact variants at the correct current price, tax, and any active
   offer in seconds, **so that** the queue moves and the customer isn't
   overcharged or undercharged.
2. **When** a customer returns an item because the size is wrong, **the associate
   wants to** swap it for another size/colour in one transaction with no cash
   refund, **so that** the sale is retained and stock stays accurate.
3. **When** the customer wants a genuine refund, **the associate wants to** return
   it to the original payment method within policy with a captured reason,
   **so that** it's fair, auditable, and feeds buying decisions.
4. **When** HQ launches a seasonal sale, **retail ops wants** the right discount
   to apply automatically at every till for the right products and dates,
   **so that** pricing is controlled and margin is protected.
5. **When** a shift ends, **the manager wants** the drawer counted blind and
   reconciled against the system with variances explained and signed off,
   **so that** cash is controlled and the day closes cleanly and compliantly.
6. **When** stock arrives or is damaged, **the manager wants to** adjust
   variant-level inventory with a reason, **so that** the store figure stays
   trustworthy between full counts.

---

## 6. Scope

### 6.1 In scope — v1 (Pilot)

**Single store, one active till session at a time.**

| Module | v1 includes |
|---|---|
| **Catalog & variants** | Style (style code, name, brand, category, season, HSN, tax class, MRP) → **variants = size × colour**, each with its own EAN-13 barcode and sellable status. Size scales: alpha (XS–XXXL), numeric top (36–46), numeric waist (28–40), footwear UK (5–11), free size. CSV import/export. |
| **Inventory** | Variant-level on-hand. Auto-decrement on sale, auto-increment on resaleable return. Manual stock adjustment (receive / damage write-off / correction) with reason + user. Low-stock flag per variant. |
| **Checkout** | Scan variant barcode or search (style / colour / size); cart with qty; running total with **GST breakup** (CGST/SGST); line and cart discount display; **park & recall** a sale; void with reason (manager). |
| **Pricing** | MRP is tax-inclusive and printed on the tag. **Price change** = effective-dated new price (tag = till). Distinct from promotions. |
| **Promotions** | **Flat % off** scoped to category / brand / collection / style-list, with a date window, optional min qty or spend, one automatic promo per line, a per-promo max-discount cap. **Manual line discount** up to a cap; above cap needs manager approval. Stacking: automatic promo **or** manual discount, not both. |
| **Returns & exchanges** | Look up original receipt (or by customer phone). Policy gate: tags-on, unworn, within **N days** (config), category exclusions (innerwear / altered / marked final-sale). **Exchange (default):** even swap = no tender movement; uneven = collect or refund the difference. **Refund:** to original tender; store credit as fallback. **Reason capture** (size / fit / defect / changed mind / wrong item). Resaleable → back to stock; defective → quarantine (RTV queue). |
| **Till / cash** | Open with counted float; cash movements (sale, refund, paid-out, safe drop); **blind close & count** by denomination; expected-vs-counted **variance** with tolerance, reason, and manager sign-off; **Z-report** — gross sales, GST collected, tender mix, discounts given, returns & exchanges, net cash, variance. Receipt reprint. |
| **Payments** | **UPI (integrated, one PSP) + cash** in v1. Card via the same PSP if it's a trivial add; otherwise v2. Payments sit behind an interface so the PSP can be swapped. |
| **Roles & audit** | **Associate** vs **Manager**. Manager approval for: discount over cap, no-receipt return, out-of-tolerance cash variance, void after tender. Every override written to an append-only audit log (who / when / why). |
| **Receipt & invoice** | GST-compliant tax invoice — GSTIN, HSN per line, CGST/SGST split, tax-inclusive MRP shown, rounding line. Print + reprint. |

### 6.2 Out of scope — v1 (deferred, with rationale)

| Deferred | To | Why not v1 |
|---|---|---|
| Multi-store; central price/promo push; store-to-store transfers | v2 | Prove the single-store loop with real users first; central control is a different problem worth doing once, well |
| Loyalty / customer profiles / clienteling | v2 | Valuable but not required to transact; v1 captures phone number so the data exists later |
| BOGO / "buy 3 for ₹1999" / threshold bundle promos | v2 | Rule-engine complexity is high; **flat % covers the large majority of apparel offers** (seasonal sale, EOSS, category). Promo schema is designed to accept these later. |
| Card acquiring beyond the one PSP; wallets; EMI; gift cards | v2 | Each is its own integration + reconciliation; UPI + cash covers the pilot |
| **Offline mode** (local queue + sync) | v2/v3 — **decision gate** | Significant cost. v1 assumes reliable in-store connectivity and **instruments downtime**. Build offline only if the pilot proves lost sales above an agreed threshold. Don't pay the offline tax on a hypothesis. |
| ERP API sync (master data, GRN, transfers) | v2 | v1 uses **CSV import/export** to de-risk the integration dependency and still ship |
| E-invoicing / IRN generation | v3 | Turnover-threshold dependent; most single stores are under the limit |
| Omnichannel — endless aisle, click-&-collect, buy-online-return-in-store | v3 | Requires OMS + e-com; a different product bet |
| Barcode/label printing, cash-drawer kick, RFID, weighing scale | v2 | Hardware breadth; standard once the core is stable |

---

## 7. Key product decisions

1. **Buy, don't build, payments.** Integrate one PSP with a retail SDK and local
   support. PCI scope, settlement, device certification, and reconciliation are
   multi-year work with zero differentiation. *Risk:* PSP lock-in → mitigated by
   a payments interface in the code.
2. **Exchange-first returns.** The return flow defaults to **exchange**, not
   refund. It matches the apparel reality (fit, not regret), retains revenue, and
   keeps variant stock accurate. Refund is the explicit fallback.
3. **Flat-% promotions only in v1.** Covers seasonal sale / EOSS / category and
   brand offers — the bulk of apparel promotions by frequency. BOGO and bundles
   are deferred but the promo data model accepts them.
4. **Price change ≠ promotion.** Permanent markdowns are modelled as
   effective-dated price changes so the **tag matches the till** and margin
   reporting stays clean. Promotions are till-time rules that never rewrite the
   base price.
5. **CSV for ERP in v1, API in v2.** Decouples the launch from an integration
   project. The store can operate day one; sync is an enhancement, not a blocker.
6. **Online-first, offline behind a decision gate.** Assume connectivity for the
   pilot, measure it, and let data — not fear — decide whether to fund offline.
7. **Blind cash count.** The cashier counts without seeing the expected figure.
   Produces an honest variance signal and discourages "adjust to match."
8. **One till session in v1.** Handover = close + reopen. Multiple cashiers on one
   drawer is deferred.

---

## 8. Functional requirements (condensed)

Full user stories with acceptance criteria are the **next deliverable
(backlog + roadmap)**. Summary of what "done" means for v1:

- **Catalog:** an associate can find any sellable variant in ≤ 2 actions (scan, or
  search by style then pick size/colour from a grid). Non-sellable variants can't
  be added to a cart.
- **Checkout:** a 3-line basket with one active promo bills correctly — subtotal,
  discount, CGST/SGST, rounded total — and matches a hand calculation to the
  paisa. A parked sale can be recalled on the same till within the shift.
- **Promotions:** a category promo with a date window applies automatically only
  to in-scope lines within the dates, never exceeds its cap, and never stacks with
  a manual discount.
- **Exchange:** an even swap (same style, size 40 → 42) completes with **zero**
  tender movement, decrements the 42, increments the 40 if resaleable, and prints
  an exchange receipt referencing the original.
- **Refund:** goes only to the original tender (or store credit), captures a
  reason, and posts a **reversal** entry — the original sale is never edited or
  deleted.
- **Till close:** a blind denomination count yields expected / counted / variance;
  within tolerance closes straight through; outside tolerance requires a typed
  reason and manager sign-off before the Z-report generates.
- **Audit:** every manager approval and every stock adjustment is queryable by
  user, type, and date.

---

## 9. Success metrics

**North Star:** **Transactions completed per staffed hour** — throughput is the
job of a POS.

| Tier | Metric | v1 target / intent |
|---|---|---|
| **Primary** | Median scan-to-pay time, 3-item basket | < 45 seconds |
| | Checkout error rate (voids + price overrides per 100 txns) | Trend down; baseline in week 1 |
| | Exchange share of all returns | Up — revenue retained |
| | Day-closes within ±₹100 variance | > 90% |
| | Median day-close duration (start of count → Z-report) | < 10 minutes |
| | Variant inventory accuracy vs cycle count | Within ±2% by unit |
| **Guardrail** | Discount rate (% of gross given away) | Must not rise vs pre-launch |
| | Return rate | Watch it doesn't climb because exchange is "too easy" / fraud |
| | Till-app uptime in trading hours | 99.9% |
| | Cashier time-to-productive (first solo shift) | ≤ 1 shift with on-floor support |
| **Adoption** | % of store transactions through the new POS | > 98% by end of pilot |
| | Associate CSAT / support tickets per store per week | CSAT ≥ 4/5; tickets trend down |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| PSP integration / device certification slips | Start PSP evaluation now; shortlist by retail SDK quality + local support; keep cash as the always-available fallback |
| GST invoice format / rounding wrong | Tax consultant signs off the invoice spec **before** pilot; golden-file tests on totals |
| Cashier resistance vs the familiar old system | Co-design with 2 pilot stores; on-floor support for week 1; keep the checkout ≤ 3 taps |
| ERP master-data quality (missing barcodes, wrong MRP) | Data audit + CSV validator with an error report before go-live; block go-live on > X% bad rows |
| Scope creep from HQ ("just add loyalty") | The out-of-scope table + roadmap **is** the agreement; changes go through it |
| Connectivity worse than assumed | The offline decision gate; measure downtime from day one |
| Exchange flow abused for fraud | Reason capture + manager approval for no-receipt; audit report on exchanges by associate |

---

## 11. Open questions

- Which PSP(s)? Is **card** acquiring in v1 or v2?
- Return window and category exclusions — who is the policy owner (retail ops)?
- Do we capture **customer phone at v1** for receipt-less returns (and future loyalty)?
- Barcode standard — trust vendor EAN on tags, or re-tag at the DC?
- Pilot: how many stores, what profile, and what are the exit criteria?
- Hardware — bring-your-own Android tablets or supplied terminals? Standard printer model?
- Does finance need a specific export format (Tally / Busy / custom)?

---

## 12. Release roadmap

| Release | Theme | Headline scope |
|---|---|---|
| **v1 — Pilot** | *Sell, exchange, close the day* — 1 store → 3 stores | Variant catalog, variant inventory + manual adjustments, checkout (UPI + cash), flat-% promotions, returns & exchanges, till + Z-report, roles + audit, CSV ERP import/export |
| **v2 — Rollout** | *Many stores, richer offers, connected* | Multi-store + central price/promo push + transfers, BOGO / bundle / threshold promos, card + wallets + gift cards, loyalty & customer profiles, ERP API sync, label printing, **offline queue if the gate triggered** |
| **v3 — Differentiate** | *Omnichannel & intelligence* | Endless aisle, click-&-collect, buy-online-return-in-store, e-invoicing / IRN, returns-analytics dashboard for buying, associate clienteling app |

---

## 13. Assumptions

- Single legal entity, GST-registered, regular scheme, tax-inclusive MRP pricing.
- In-store staff of 2–6; 1–3 till points; Android tablet + Bluetooth scanner + thermal printer.
- A back-office ERP already holds style/variant masters and receives stock (source of truth for master data; POS owns *store* on-hand between counts).
- Reliable in-store internet for the pilot (to be measured).
- Pilot retailer is willing to co-design and run week-1 support.

---

## Appendix A — How this maps to what's already built

| Asset | Relationship to this brief |
|---|---|
| [01-workflow.md](01-workflow.md) | The three process flows (sale, returns, cash/EOD) are the backbone. Re-read for apparel: "item" → **variant**, "return" → **return-or-exchange**, "discount" → **seasonal markdown / category promo**. |
| [../mockup/index.html](../mockup/index.html) | Working click-through of checkout / returns / till / Z-report. **Gaps to close for full alignment with this PRD:** (1) catalog needs style → size×colour variants instead of flat SKUs; (2) returns screen needs an **exchange** path (even + uneven); (3) promo field should support category-scoped flat-% with a date window. These are the next prototype iteration. |

## Appendix B — Interview narrative

> *"I don't have hands-on EPOS experience, so I built a working apparel-retail POS
> myself — variant inventory, seasonal promotions, size/colour exchanges, and
> end-of-day till reconciliation — specifically because it extends my textile and
> garment ERP background into the retail transaction side of the same industry.
> I scoped the MVP, wrote the product brief, and used an AI-assisted build to
> produce a click-through prototype to pressure-test the requirements."*

**Talking points this brief sets you up to defend:**
- Why *exchange-first* returns is the right default for apparel (revenue + stock accuracy).
- Why *flat-% only* in v1 and what you'd need to see to prioritise BOGO.
- The *price change vs promotion* distinction and why it protects margin reporting.
- *Buy vs build* on payments — and how you'd de-risk PSP lock-in.
- The *offline decision gate* — making an architecture call with data instead of fear.
- Your *North Star* choice (transactions per staffed hour) and the guardrail metrics that stop it being gamed.
