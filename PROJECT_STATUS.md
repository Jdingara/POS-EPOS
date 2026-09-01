# PROJECT_STATUS.md

**Single source of truth for this project.** If this file and any other file
(including README.md) disagree, this file is correct and the other should be
fixed to match.

---

## Goal

A **fashion & apparel point-of-sale (POS / EPOS)** system for single-store
retailers, built AI-assisted as a learning + portfolio project by a senior
Business Analyst moving into **Product Management / Product Ownership**. Purpose:
understand POS deeply enough to scope, defend and demo it in interviews, framed
as a natural extension of the author's textile/garment **ERP** background into
the retail transaction side of the same industry.

---

## Core Decisions / Rules

Decided and stable. **Do not change any of these without explicit user
confirmation.**

1. **Domain is apparel retail specifically.** A garment is a `Style` with a
   **size × colour `Variant` matrix**, not a flat SKU. The variant carries the
   barcode and stock. Chosen because it connects to the author's ERP background
   and to a target employer's "fashion retail" customer type.
2. **Scope is a single store, one open till session at a time.** Multi-store,
   central price/promo push and store transfers are explicitly v2.
3. **Exchange-first returns.** The returns flow defaults to *Exchange*, not
   *Refund* — retains revenue, keeps variant stock accurate, matches the apparel
   fit-problem reality. Refund is the fallback.
4. **Price change ≠ promotion.** A permanent markdown lowers `Style.mrp_paise`
   (and the shop re-tags). A promotion is a till-time rule. They never touch each
   other — this keeps margin reporting honest.
5. **Flat-% promotions only in v1** — off a category / brand / explicit style
   list, inside a date window, optional cap. BOGO / bundles / thresholds are v2;
   the `Promotion` schema is designed to accept them later.
6. **Buy, don't build, payments.** One PSP behind the `Payment` seam. v1
   simulates Cash / Card / UPI in the UI (sandbox) — no real settlement.
7. **Money is integer paise everywhere** in code and on the wire. Rupees exist
   only at the edges (seed data, receipts, UI display).
8. **Completed sales are immutable.** A return writes a separate `ReturnTxn`,
   bumps `SaleLine.returned_qty`, and recomputes the sale's status. Never edit or
   delete a sale.
9. **Blind cash count** at till close. Variance tolerance is **±₹100**; outside
   it, a typed reason **and** a manager sign-off are required before the Z-report.
10. **Two roles: associate and manager.** Manager approval is required for a
    discount/refund over **₹2,000**, a no-receipt return, and an out-of-tolerance
    cash variance.
11. **GST**: 5% at or below ₹1,000 per piece, 12% above; `Style.tax_rate_override`
    wins if set. The MRP is **tax-inclusive**, so tax is backed out of it.
12. **Stack**: React + Vite frontend · Django + DRF + PostgreSQL backend · Docker
    Compose delivery · DRF token auth.
13. **Host ports 8091 (frontend) / 8001 (backend) / 5434 (db).** Non-default on
    purpose — this machine runs other stacks on 5432, 5433, 8000, 8069, 8080,
    8090. Always `docker ps` before assuming a port is free.
14. **`mockup/index.html` is the frozen Phase-2 prototype.** It predates the
    apparel pivot and uses a grocery catalog. Kept as history; not maintained;
    superseded by the PRD + the real app.
15. **This project has a product track, not just code.** `docs/02-product-brief.md`
    (the mini-PRD) is the interview centrepiece; `docs/01-workflow.md` and the
    running app are supporting evidence.
16. **DRF routers use `trailing_slash=False`** (see Findings). Frontend API calls
    must stay slash-free to match.
17. **Repo is public on GitHub** at `https://github.com/Jdingara/POS-EPOS`
    (`origin`, branch `main`). Chosen public so the link can go straight into job
    applications.

---

## Non-Obvious Technical Findings

Things that would waste time if rediscovered from scratch.

1. **No usable local Python.** `python` / `python3` on PATH are Microsoft Store
   stubs that return "Permission denied" under Git Bash. All backend work goes
   through Docker. Node is fine and is used for API smoke tests.
2. **Occupied host ports.** 5432 / 5433 / 8000 / 8069 / 8080 / 8090 are already
   bound by other Docker stacks (a CPQ app, Odoo, itexclouds-postgres). This
   project deliberately uses 8091 / 8001 / 5434.
3. **DRF `DefaultRouter` trailing-slash redirect drops POST bodies.**
   `/api/catalog/styles` → 301 → `/api/catalog/styles/`, and the redirect turns
   the POST into a body-less GET. Fixed with `DefaultRouter(trailing_slash=False)`
   in `catalog/urls.py` and `sales/urls.py`. Every frontend call is slash-free to
   match. Do not revert.
4. **Migrations are generated at container start.** `backend/entrypoint.sh` runs
   `makemigrations` → `migrate` → `collectstatic` → `seed` → `gunicorn`. There
   are **no committed migration files** — a deliberate learning-project
   convenience so the schema always matches the models. Change a model → restart
   the backend container and it regenerates. Production would commit migrations.
5. **`.gitattributes` forces `* text=auto eol=lf`.** Without it, a Windows
   checkout gives `entrypoint.sh` / `nginx.conf` CRLF line endings that break
   inside the Linux containers (`/bin/sh^M: bad interpreter`). Do not remove it.
6. **WhiteNoise uses `CompressedStaticFilesStorage` (non-manifest).** The
   manifest variant fails `collectstatic` if any static reference is missing.
   Keep non-manifest unless every reference is verified.
7. **Cold-start latency.** The first requests to a fresh gunicorn sync worker can
   take ~1–1.5 s. The Sell receipt modal appears when the checkout POST resolves,
   not instantly — this was briefly suspected as a bug and is not one.
8. **Even-exchange bookkeeping.** In `sales/services.process_return`, returned
   goods become a `STORE_CREDIT` "trade-in" `Payment` on the new
   `exchange_sale`; `diff = exchange_total − returned_value` drives collect
   (> 0) / refund (< 0) / even (0).
9. **`core.Sequence`** gives gap-free document numbers (`INV-…`, `RET-…`) via
   `select_for_update`. Do not replace with `count() + 1` — it races.
10. **Prototype bugs already fixed** (Phase 2, `mockup/index.html`): a duplicate
    `class` attribute killed the "open the till" lock overlay; and on cash sales
    the payment modal's auto-close wiped the receipt that `finaliseSale` had just
    rendered — fixed by returning `false` from the cash modal's `onConfirm`.
11. **Browser-automation note.** The MCP `browser_click` tool is flaky against
    this React SPA; use `browser_evaluate` with a native `.click()` or direct
    navigation for testing. Real user clicks work — it is not an app bug.

---

## Full Roadmap

| Phase | Milestone | Status |
|---|---|---|
| 1 | **Workflow design** — sale / returns / cash-EOD flows as a diagram | ✅ Done — `docs/01-workflow.md` |
| 2 | **Product brief (mini-PRD) + click-through prototype** | ✅ Done — `docs/02-product-brief.md`, `mockup/index.html` (prototype is pre-pivot, grocery-flavour) |
| 3 | **Full-stack apparel app** — React + Django + PostgreSQL, Docker | ✅ Built & verified end-to-end; committed `a1a9f66` on `main` |
| 3.1 | Alignment & housekeeping — ✅ pushed to GitHub (`Jdingara/POS-EPOS`, public); ⬜ prototype re-skin decision; ⬜ README screenshots | ⏳ In progress |
| 4 | **Backlog + roadmap doc** — epics → user stories + acceptance criteria, MoSCoW/RICE, v1/v2/v3 release plan | ⬜ Not started |
| 5 | **PM interview prep pack** — POS/retail PM question bank + STAR stories built on this project | ⬜ Not started |
| — | Ongoing — keep the app aligned with the PRD; keep this file current | 🔄 Continuous |

---

## Current Status

**Last updated: 2026-09-01**

**Where the project stands:** all three original phases are complete. There is a
running, verified full-stack apparel POS, plus the workflow diagram, the mini-PRD,
and an architecture walkthrough. The next work is the product-artifact track
(Phase 4/5) and pushing to GitHub.

**How we got here.** The project began as a generic single-store POS following a
three-prompt plan (workflow → HTML mockup → full app). Partway into the Phase 3
setup the user redirected it to **apparel retail specifically**. Rationale, in
the user's words: it gives a coherent interview story (extends their textile /
garment ERP experience into the retail side of the same industry) rather than
"I built a generic POS to learn POS", and apparel is where POS gets genuinely
substantive — size/colour variant matrices, seasonal markdowns, and
exchange-heavy returns. The user is a senior Business Analyst targeting Product
Manager / Product Owner roles, so the project carries a **product track**
alongside the code; the chosen first product deliverable was the mini-PRD, which
is done.

**Phase 1 — `docs/01-workflow.md`.** A single Mermaid `flowchart TD` with three
sub-flows: main sale, returns/refund, and cash-management / end-of-day, each with
a one-line explanation, a business-rules table, and a real-vs-simulated split.
Written generically; now read through an apparel lens (item → variant, refund →
refund-or-exchange, discount → seasonal markdown).

**Phase 2 — brief + prototype.** `docs/02-product-brief.md` is a full mini-PRD
for the apparel POS: problem framing around the four things generic POS gets
wrong for apparel, six personas, JTBD, v1 scope in/out with rationale, eight key
product decisions (the interview ammunition), success metrics with a
transactions-per-staffed-hour north star, risks, roadmap, and — quarantined in
Appendix B — the interview narrative. `mockup/index.html` is a vanilla
HTML/CSS/JS click-through with LocalStorage. **It predates the apparel pivot and
still uses a grocery catalog** (Basmati Rice, etc.); it is frozen as history.
Two real bugs were found and fixed while testing it (see Findings #10).

**Phase 3 — the app.** Built and verified.

- *Backend* — Django 5 + DRF + PostgreSQL 16. Apps: `accounts` (custom `User`
  with `role`, token login), `catalog` (`Category` / `Brand` / `Style` /
  `Variant` / `StockMovement` / `Promotion` + a pure-function pricing engine in
  `pricing.py`), `sales` (`Sale` / `SaleLine` / `Payment` / `ReturnTxn` /
  `ReturnLine` + `services.py` holding `checkout()` and `process_return()`),
  `till` (`TillSession` / `CashMovement` + `services.py` for reconciliation and
  the Z-report, plus a dashboard endpoint), `core` (`Sequence`, health, the seed
  command). Checkout is one atomic transaction with `SELECT … FOR UPDATE` on
  stock rows.
- *Frontend* — React 18 + Vite SPA. Screens: Login, Sell (catalog grid →
  size/colour variant picker → cart with live re-pricing → Cash/Card/UPI modals →
  receipt), Returns & Exchange (receipt lookup → per-line qty/condition/reason →
  exchange or refund, with the even/collect/refund difference shown), Till/Cash
  (open float → movements → blind count → Z-report), Dashboard (today's KPIs +
  tender mix). Token in `localStorage`; plain CSS carried over from the prototype.
- *Delivery* — `docker-compose.yml` with `db`, `backend` (migrates + seeds on
  start), and `frontend` (Vite build served by nginx, which also reverse-proxies
  `/api` and `/admin`). The browser only ever hits `:8091`.
- *Verified* — a full path was exercised both through a scripted Node API test
  and through the browser: login → open till (₹2,000 float) → add an Oxford shirt
  via the variant picker → *Brand Day 15%* promo auto-applies → 12% GST backed
  out of the tax-inclusive MRP → cash checkout → receipt → stock 112 → 110;
  an even-swap exchange moved ₹0; a dress refund of ₹899.40 went back to UPI as a
  reversal; the Z-report closed with ₹0 variance; the dashboard tender mix was
  correct.
- *Fixes made during the build* — DRF routers switched to `trailing_slash=False`
  after 301s were swallowing POST bodies; `opened_by_name` was showing the
  username, switched to `get_full_name`; the cash quick-amount chips were
  computing values below the total for high-ticket apparel, recomputed to always
  be ≥ due; `.gitattributes` added to force LF so `entrypoint.sh` survives a
  Windows checkout.
- *Tried and reverted / adjusted* — briefly added `*.png` to `.gitignore`, then
  removed it (README screenshots may be wanted later). Started on
  `CompressedManifestStaticFilesStorage`, switched to the non-manifest variant
  because `collectstatic` is strict about missing references.
- *Committed* — `a1a9f66` (the app) and `f60d980` (the doc system) on branch
  `main`, 83 files. The user's personal `Need to Learn.docx` is gitignored.
- *Docs added* — `docs/03-architecture.md` is a learning-oriented walkthrough
  (request lifecycle, data model, the pricing maths, the three flows and where
  their code lives, atomicity/locking, auth, Docker layout, and a table of
  deliberate simplifications vs what production would do).

**This session** also set up the four-file persistent-memory system
(`CLAUDE.md`, `AGENTS.md`, this file, and a slimmed `README.md`) and trimmed
`README.md` down to run/usage only, moving all history and rationale here. Then
the user created an empty **public** GitHub repo — `https://github.com/Jdingara/POS-EPOS`
— and both commits were pushed to `origin/main` (`git remote add origin …` +
`git push -u origin main`; Git Credential Manager handled the sign-in). No CI,
no branch protection, no release tags yet.

**2026-09-01 session** — restarted the stack (Docker Desktop was not running;
started it, `docker compose up -d`, all three containers healthy). Fixed a Sell
search bug the user hit (`28c6fba`): `catalog/views.py` filtered barcodes with an
exact match, so a partial number like `0046` matched nothing; changed to
`barcode__icontains` (start/middle/end) plus `size__iexact`. `Sell.jsx` was also
leaving a stale result list on screen next to the "No match" toast — it now
clears, and only an exact full-barcode hit auto-adds to the cart (partial hits
list for the user to pick). Backend rebuilt + verified with curl across
barcode/name/colour/size searches. Committed and pushed.

Also this session: **Returns screen UX**, two passes. First (`a625cfc`) added a
−/+ stepper, a hint, and a "why is Process disabled" line — but the user still
read the greyed condition/reason dropdowns as broken. Second pass (`3b11b08`)
removed the gate: each line now has a **checkbox** (tick = select the whole
returnable qty), the condition/reason selects are always enabled (disabled only
when the line is already fully returned, which is now dimmed + labelled), and
changing a dropdown auto-selects the line. The −/+ stepper stays for partial
quantities. No backend change — the return/exchange logic itself works.

**Currently running:** `docker compose ps` shows `backend` / `db` / `frontend`
Up on 8001 / 5434 / 8091. The DB volume has persisted since the 2026-08-31
session (fresh seed + several smoke-test sales incl. INV-20260901-000x; a till
is open).

---

## Open Decisions

- **App name mismatch** — the code/docs call the store *THREADLINE*; the GitHub
  repo is `POS-EPOS`. Cosmetic, but decide whether to align (rename repo, or drop
  the THREADLINE branding).
- **Prototype re-skin** — `mockup/index.html` is still grocery-flavour. Decide:
  re-skin it to apparel (variant catalog + exchange flow) so the PRD and the
  prototype tell one story, or leave it frozen as history and rely on the real
  app for demos. Appendix A of the brief lists the exact gaps.
- **Order of Phase 4 vs Phase 5** — backlog+roadmap doc first, or the PM
  interview prep pack first. User picked the mini-PRD first (done); the remaining
  two are not yet ordered.
- **PSP choice for the payments story** — which provider(s), and whether Card
  acquiring is v1 or v2 (from the PRD's open questions).
- **Seed a demo transaction?** — the seed currently loads master data only, so
  Dashboard / Z-report are empty on first boot. Decide whether to seed one open
  till + a sale so those screens are non-empty for a first-time demo.
- **Split tender** — described in the workflow, implemented in neither the
  prototype nor the app. Decide if v1 needs it.

---

## Repo Structure

```
CLAUDE.md / AGENTS.md     identical pointer files -> "read PROJECT_STATUS.md first"
PROJECT_STATUS.md         this file - single source of truth
README.md                 how to run it (setup + usage only; points here for context)
docker-compose.yml        db + backend + frontend; host ports 8091 / 8001 / 5434
.gitattributes            forces LF endings (keeps entrypoint.sh working in containers)
.gitignore                excludes venv/build artefacts, .playwright-mcp/, personal .docx

docs/
  01-workflow.md          Phase 1 - Mermaid flowchart of the 3 core flows
  02-product-brief.md     Phase 2 - mini-PRD (apparel); the interview centrepiece
  03-architecture.md      Phase 3 - how the app is built (learning walkthrough)

mockup/
  index.html              Phase 2 prototype - FROZEN, grocery-flavour, pre-pivot
  README.md               prototype notes / test scenarios

backend/                  Django 5 + DRF
  config/                 settings, urls, wsgi/asgi
  accounts/               custom User (role), token login, staff list
  catalog/                Style / Variant / StockMovement / Promotion + pricing.py engine
  sales/                  Sale / SaleLine / Payment / ReturnTxn + services.py (checkout, process_return)
  till/                   TillSession / CashMovement + services.py (reconcile, z_report) + dashboard
  core/                   Sequence (doc numbers), /api/health, seed management command
  entrypoint.sh           makemigrations -> migrate -> collectstatic -> seed -> gunicorn
  Dockerfile, requirements.txt, .dockerignore

frontend/                 React 18 + Vite
  src/
    api.js                fetch wrapper + token handling + DRF error flattening
    money.js              paise <-> rupee helpers
    pos-context.jsx       auth + till state + toast provider
    App.jsx               shell: header, tab nav, routes
    components/Modal.jsx   generic modal
    screens/              Login, Sell, Returns, Till, Dashboard
  vite.config.js          dev-server /api proxy -> localhost:8001
  nginx.conf              SPA fallback + proxy /api and /admin to backend:8000
  Dockerfile              node build -> nginx:alpine
  .dockerignore
```
