# zenOS

zenOS is a full-stack productivity dashboard for students and early-career builders managing internships, learning tracks, projects, and coding prep in parallel.

## Stack

- Frontend: React, TypeScript, Tailwind CSS, Zustand, TanStack Query, React Router
- Backend: FastAPI, SQLAlchemy, Pydantic, JWT auth
- Database: SQLite for local development, PostgreSQL for production
- Migrations: Alembic

## Features

- JWT email/password auth with `/register`, `/login`, and `/me`
- Default workspace categories: Internships / Work, Learning, Projects, DSA
- Category and subbranch CRUD with cascading deletes
- Task CRUD with daily or long-term type, due date, priority, estimated hours, progress, and completion state
- Completion checkbox auto-sets progress to 100 and moves tasks to completed views
- Today, Long-Term, Board, and Completed views
- Dashboard stats: completed today, pending, overdue, streak, category progress, top active category, suggested tasks
- Dark mode, responsive sidebar, search, and category/subbranch filters

## Project Structure

```text
backend/
  app/
    api/          FastAPI routers and dependencies
    core/         settings and security
    db/           SQLAlchemy session setup
    models/       ORM models
    schemas/      Pydantic schemas
    services/     workspace defaults and task helpers
  alembic/        migration setup
frontend/
  src/
    api/          API client modules
    components/   reusable UI
    hooks/        query/mutation hooks
    pages/        auth and dashboard pages
    store/        Zustand UI store
```

## Local Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`.

For quick SQLite development, the app also creates tables on startup when `ENVIRONMENT=development`.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

The app runs at `http://localhost:5173`.

## Environment Variables

### Backend

```env
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://user:password@host:5432/database
SECRET_KEY=replace-with-a-long-random-secret
BACKEND_CORS_ORIGINS=https://your-vercel-app.vercel.app
```

### Frontend

```env
VITE_API_URL=https://your-backend.onrender.com
```

## Deployment

The shortest full deployment path is covered in [DEPLOYMENT.md](DEPLOYMENT.md). This repo includes a Render blueprint at [render.yaml](render.yaml), Vercel SPA rewrites at [frontend/vercel.json](frontend/vercel.json), Dockerfiles, and Alembic migrations.

### Supabase or Neon

1. Create a PostgreSQL database.
2. Copy the connection string.
3. Paste it into `DATABASE_URL`. The backend accepts `postgres://`, `postgresql://`, and `postgresql+psycopg://` formats.

### Render

1. Create a new Web Service from this repo.
2. Root directory: `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add backend environment variables from above.

### Vercel

1. Import the repo.
2. Root directory: `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add `VITE_API_URL` pointing at the Render/Railway backend.

## Docker

Run PostgreSQL and the backend locally:

```bash
docker compose up --build
```

Then run the frontend with `npm run dev` from `frontend/`.

## API Routes

- `POST /register`
- `POST /login`
- `GET /me`
- `GET /categories`
- `POST /categories`
- `PUT /categories/{id}`
- `DELETE /categories/{id}`
- `GET /subbranches/{category_id}`
- `POST /subbranches`
- `PUT /subbranches/{id}`
- `DELETE /subbranches/{id}`
- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/{id}`
- `DELETE /tasks/{id}`
- `PATCH /tasks/{id}/complete`
- `GET /dashboard/stats`
