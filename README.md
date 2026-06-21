# SettleIt

A mobile-first web app where a group of friends makes a decision together — and then actually
follows through on it. An admin opens a **room** with a topic, friends join with just a name, the
group chats, an AI agent reads the room and proposes **suggestion cards**, everyone **votes**, a
**decision locks**, and the app turns that decision into **missions** with grounded next steps.

It's an agent, not a chat-with-AI button: it has state, drives the group to a locked decision, and
then keeps pushing until the decision happens.

> Signature interaction — **the huddle**: votes are shown as a gathering crowd. Voting moves your
> token onto a card, backers cluster, and at lock time the whole group settles around the winner.

## Stack

- **Frontend** — React + TypeScript + Vite, Tailwind CSS, shadcn/ui, framer-motion, lucide-react.
- **Backend** — Python FastAPI (async), REST + WebSocket.
- **Database** — PostgreSQL via SQLAlchemy 2.0 (async) + Alembic migrations.
- **Realtime** — native FastAPI WebSockets, single instance, in-memory registry behind a broadcast
  interface (a Redis backend can be dropped in later without touching feature code).
- **AI** — Gemini (`gemini-2.5-flash`) with automatic fallback to Groq, behind one swappable
  provider interface. Web search grounding via Tavily. All AI keys live on the backend only.

## Layout

```
SettleIt/
├─ backend/            FastAPI app, async SQLAlchemy models, Alembic migrations, seed script
│  ├─ app/
│  │  ├─ main.py       app + CORS + health + WebSocket route
│  │  ├─ config.py     env-driven settings (pydantic-settings)
│  │  ├─ database.py   async engine / session / Base
│  │  ├─ models.py     full schema (templates, rooms, members, …)
│  │  ├─ realtime.py   broadcast interface + in-memory implementation
│  │  ├─ seed.py       seeds the built-in movie-night template
│  │  └─ api/          routers (health now; rooms/votes/missions next)
│  └─ alembic/         migration env + versions/
├─ frontend/           Vite + React + TS, Tailwind + shadcn, design tokens
├─ docker-compose.yml  local Postgres
└─ .env.example        every required variable
```

## Prerequisites

- Python 3.11+ and Node 18+
- Docker (for local Postgres) — or your own Postgres 16

## Local setup

### 1. Database

```bash
docker compose up -d db
```

### 2. Backend

```bash
cd backend
cp ../.env.example .env            # fill in keys as you need them
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head                    # create the schema
python -m app.seed                      # seed the movie-night template
uvicorn app.main:app --reload --port 8001   # http://localhost:8001  (docs at /docs)
```

Check it's alive: `curl http://localhost:8001/api/health` → `{"status":"ok","database":true}`

> Ports: Postgres is published on host **5433** and the API runs on **8001** to avoid clashing with
> other local stacks. Override via `DATABASE_URL` / `--port` and `VITE_API_URL` if you prefer the
> defaults.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

The landing screen shows the SettleIt identity and a live backend/database status pill, so you can
confirm the whole stack is wired end to end.

## Environment

All configuration is via env vars (12-factor — no local-filesystem state). See
[`.env.example`](.env.example) for the full list: database URL, LLM provider + keys, Tavily key,
session secret, CORS origins.

## Migrations

```bash
cd backend
alembic revision --autogenerate -m "describe change"   # create a migration
alembic upgrade head                                    # apply
alembic downgrade -1                                    # roll back one
```

## Build milestones

1. **Scaffold** *(this milestone)* — monorepo, schema, migrations, seed, health check, design tokens.
2. Rooms + identity + live chat over WebSocket.
3. Generation loop — capped Generate → async job → cards → voting → lock.
4. Execution layer — missions, self-assign + random, grounded starter boxes.
5. Custom topics — the template-generator pipeline.
6. Polish + deploy to Render.

Movie night is taken fully through milestones 2–4 before any topic is generalized.
