# THREADLINE — Apparel Retail POS / EPOS

An end-to-end fashion & apparel point-of-sale system, built as a learning +
portfolio project. It extends a textile/garment **ERP** background into the
**retail front-of-house**: variant-matrix inventory, seasonal promotions,
size/colour **exchanges**, and end-of-day till reconciliation.

Built AI-assisted, in three phases:

| Phase | Deliverable | Location |
|---|---|---|
| 1 — Workflow | The three core process flows as a diagram | [docs/01-workflow.md](docs/01-workflow.md) |
| 2 — Product & prototype | Mini-PRD + a click-through HTML prototype | [docs/02-product-brief.md](docs/02-product-brief.md) · [mockup/index.html](mockup/index.html) |
| 3 — Full app | React + Django + PostgreSQL, Dockerised | `backend/` · `frontend/` · `docker-compose.yml` |

A walkthrough of how the app is put together (for building dev knowledge) is in
[docs/03-architecture.md](docs/03-architecture.md).

---

## Run it

Requires Docker Desktop.

```bash
docker compose up --build
```

Then open **http://localhost:8091**.

| Login | Password | Role |
|---|---|---|
| `cashier` | `cashier123` | Sales Associate |
| `manager` | `manager123` | Store Manager (approves overrides) |
| `admin` | `admin123` | Django admin at http://localhost:8001/admin |

The backend seeds an apparel catalog, staff and promotions automatically on first
start. **Reset to a clean slate:**

```bash
docker compose down -v && docker compose up --build
```

### Ports

This machine already runs other stacks, so non-default host ports are used:

| Service | URL | Container |
|---|---|---|
| Frontend (nginx) | http://localhost:8091 | `apparelpos-frontend-1` |
| Backend API (gunicorn) | http://localhost:8001/api | `apparelpos-backend-1` |
| PostgreSQL | `localhost:5434` | `apparelpos-db-1` |

The browser only ever talks to `:8091`; nginx proxies `/api` to the backend.

---

## Demo path (5 minutes)

1. **Open the till** — *Till / Cash* tab → *Open till* (float ₹2,000).
2. **Sell** — *Sell* tab → tap **Oxford Cotton Shirt** → pick a size/colour. The
   *Brand Day – 15% off Urban Oxford* promotion applies automatically; GST (5% or
   12% by per-piece value) is backed out of the tax-inclusive MRP. Pay by Cash.
3. **Exchange** — *Returns & Exchange* → paste the receipt number → set a return
   qty on one line → add a **different size** as the replacement → an even swap
   moves **no money**; a dearer/cheaper one collects or refunds the difference.
4. **Refund** — same screen, switch to *Refund* → goes back to the original
   tender; posts a reversal, never edits the sale.
5. **Close the day** — *Till / Cash* → *Close till & count* → enter a blind
   denomination count → variance vs. the system is shown; outside ±₹100 needs a
   reason + manager sign-off → **Z-report**.
6. **Dashboard** — today's transactions, units, discounts, returns, tender mix.

---

## Modules (maps to `docs/02-product-brief.md`)

| Module | Backend app | Frontend screen |
|---|---|---|
| Product catalog & variant inventory | `catalog` | `Sell` (catalog grid + variant picker) |
| Checkout / transaction processing | `sales` | `Sell` |
| Discount / promotion engine | `catalog` (`pricing.py`, `Promotion`) | shown live in the cart |
| Payment processing (mock) | `sales` (`Payment`) | Cash / Card / UPI modals |
| Returns & exchanges | `sales` (`services.process_return`) | `Returns & Exchange` |
| Till management & end-of-day | `till` | `Till / Cash` |
| Sales reporting dashboard | `till` (`DashboardView`) | `Dashboard` |

---

## Tech stack

- **Backend** — Django 5, Django REST Framework, PostgreSQL 16, token auth,
  gunicorn, WhiteNoise. Money stored as integer **paise**.
- **Frontend** — React 18 + Vite, React Router, plain CSS. No component library.
- **Delivery** — Docker Compose: `db`, `backend` (migrates + seeds on start),
  `frontend` (Vite build served by nginx, which also reverse-proxies `/api`).

---

## Local development without Docker

Frontend only (points at the Dockerised backend on `:8001`):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api -> localhost:8001
```

The backend is Python/PostgreSQL; running it outside Docker means a local venv +
a Postgres instance. Docker is the supported path.

---

## Notes / deliberate simplifications

See [docs/03-architecture.md](docs/03-architecture.md) for the full list. In
short: payments are sandboxed (no real PSP), migrations are generated at
container start for convenience, and a single till session is supported at a
time. Every one of these is a conscious v1 scope call from the product brief, not
an oversight.
