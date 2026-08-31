# THREADLINE — Apparel Retail POS

> **New here? Read [PROJECT_STATUS.md](PROJECT_STATUS.md) first** — it explains
> what this project is, the decisions behind it, the roadmap, and the current
> state. This README is only *how to run it*.

A fashion & apparel point-of-sale system: React frontend, Django REST + PostgreSQL
backend, delivered with Docker Compose.

---

## Prerequisites

- Docker Desktop (Compose v2)

That's all — the backend, database and frontend all run in containers.

---

## Run

```bash
docker compose up --build
```

First start takes a minute (image build + migrate + seed). Then open:

**http://localhost:8091**

| Login | Password | Role |
|---|---|---|
| `cashier` | `cashier123` | Sales Associate |
| `manager` | `manager123` | Store Manager (approves overrides) |
| `admin`   | `admin123`   | Django admin — http://localhost:8001/admin |

### Ports

| Service | URL |
|---|---|
| Frontend (nginx) | http://localhost:8091 |
| Backend API | http://localhost:8001/api |
| PostgreSQL | `localhost:5434` (db `apparelpos`, user/pass `apparelpos`) |

The browser only talks to `:8091`; nginx proxies `/api` and `/admin` to the
backend.

### Stop / reset

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop and wipe the database
docker compose up --build    # rebuild and restart (re-seeds if data was wiped)
```

---

## Using it (quick walk-through)

1. **Till / Cash** tab → **Open till** (float ₹2,000). Selling is blocked until a
   till is open.
2. **Sell** tab → tap a style (e.g. *Oxford Cotton Shirt*) → pick a size/colour.
   Active promotions apply automatically; GST is shown inclusive. Pay by
   Cash / Card / UPI (simulated) → receipt.
3. **Returns & Exchange** tab → paste a receipt number → set a return quantity on
   a line → either add a different size as a replacement (**Exchange** — even
   swaps move no money) or switch to **Refund** (goes back to the original
   tender).
4. **Till / Cash** → **Close till & count** → enter a blind denomination count →
   variance vs. the system is shown; outside ±₹100 needs a reason + manager
   sign-off → **Z-report**.
5. **Dashboard** → today's transactions, units, discounts, returns, tender mix.

---

## Frontend-only development

Runs the React dev server against the Dockerised backend on `:8001`:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api -> localhost:8001)
```

The backend is Python + PostgreSQL and is only supported via Docker (there is no
usable local Python on the dev machine — see PROJECT_STATUS.md).

---

## Handy commands

```bash
docker compose ps                        # container status
docker compose logs -f backend           # backend logs (migrate / seed / gunicorn)
docker compose exec backend python manage.py seed     # re-run the seed (idempotent)
docker compose exec db psql -U apparelpos             # psql shell
```
