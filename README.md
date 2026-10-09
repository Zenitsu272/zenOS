# zenOS

zenOS is a shared space for organizing projects and getting work done together. Each project has its own task board and optional work plans. Your private personal workspace is available at `/personal`.

## Spaces, projects, and access

The structure is **Space → Projects → Tasks and work plans**. For example, a company space can contain a Website project and an Events project, each with a separate To do / Doing / Done board. New spaces start without projects; the owner creates the first project. Unused automatic General projects are removed during migration. General projects containing tasks, work plans, or meetings remain available with their history.

One person creates and owns each space. The owner can edit the space's name and description, create projects, manage work plans, share or replace the invite link, and remove people. Changing the space's details preserves its projects, people, owner, key, and existing invite link. Members can view every project in the space and create, assign, update, upload, and discuss tasks. Members cannot edit space settings, create projects, manage invitations, remove people, or become owners by joining. Access is controlled at the space level; there are no private projects within a shared space.

To invite someone, the owner copies the space's invite link and sends it to them. Opening the link shows the space name. The person signs in or creates an account, then joins that space. Existing accounts work across multiple spaces, but a person sees only spaces they own or have joined. A login alone does not grant access to another space, and changing a space, project, task, or plan ID in a request cannot bypass membership checks.

Invite links last **7 days**. Anyone holding a valid link can join, so share it only with intended teammates. Replacing the link invalidates the old one immediately. Removing a member also replaces the link and immediately blocks that person's access to the space, even if they are still signed in. Their account and previous task discussions remain; they could join again only with a new valid invite. An expired invite does not remove people who already joined.

When email sign-in is enabled, enter your email and the six-digit code sent by **ZenOS** through Brevo. The code expires after 10 minutes, can be used once, and can be resent after 60 seconds. The same flow creates a new account or opens an existing one; an account is created only after verification. Existing accounts keep their spaces, projects, meetings, and personal tasks. An invitation stays saved while you sign in.

The API checks both the signed-in user and their current space membership on every protected request. Login tokens are signed and expire. The public invite preview returns only the space name, ID, and invite expiry, never tasks, people, or discussions. Automatic invitation emails and SSO are not included. Password sign-in remains available only when the backend explicitly uses `AUTH_MODE=password`, which supports local demo accounts and deployment before Brevo is configured. `AUTH_MODE=otp` disables password registration and login. See [DEPLOYMENT.md](DEPLOYMENT.md) for activation.

## Simple everyday workflow

The space opens on **Projects**. Choose a project to open **Tasks**, with three columns: **To do**, **Doing**, and **Done**. Use **Start task** and **Mark done** without dragging. Existing review tasks appear in Doing with a **Needs a check** label; their data is preserved.

Adding a task needs only a title. A person, due date, and notes are optional. Status, importance, a group, a work plan, and completion details live under **More options**. Existing task types and estimates are preserved when editing but are no longer required or displayed in the everyday interface.

**Later** holds ideas to return to. **People** shows the team. **Progress** counts finished tasks. **Work plans** are optional groups of tasks with a shared goal and dates; the existing sprint rules still apply underneath. The main task view includes work with no plan, so people can start using the app immediately.

**Upload tasks** includes a downloadable example. CSV headers can be `Task,Status,Due date,Notes`; statuses can be `To do`, `Doing`, `Done`, or `Later`. A file containing only the Task column works too. Original API/CSV field names remain supported.

## Project meetings

Every project has its own meetings. Any member of the space can schedule a meeting with a title, start and end time, an optional agenda, and an optional web link. Other members can see and edit scheduled meetings. Times carry a timezone and are stored in UTC.

During a review, write meeting notes and update the project's tasks together. Saving applies the notes and all selected status changes in one operation; if a task cannot be changed, none of those changes are saved. Tasks from another project cannot be included. Tasks saved in a finished work plan remain protected. Moving a task to Later removes it from its work plan.

Finish the meeting to move it into its history. Each recorded task change keeps the original task title, previous and new status, the person who changed it, and the time. That history survives a task being renamed or deleted. You can add or revise review notes and make further task updates afterward; the original meeting completion time stays the same. Finished meetings' schedule details cannot be rewritten.

Meeting links open your chosen meeting service. Scheduling and notes are stored in zenOS; calendar invitations and reminder notifications are not sent automatically.

## Your personal workspace

Personal work uses **Folder → List → Task**. New accounts start empty: create a folder with your own name, add a list inside it, then add your tasks. For example, **Home projects → Garden → Buy seeds**. You can create, rename, or delete your folders and lists. Deleting a folder or list also deletes its tasks. Personal work stays private to your account and separate from shared spaces.

**New folder**, **New list**, and **Add task** stay at the top. The first-use guide highlights the next step, and the **How to use this** question-mark button explains the flow. Task details start with a name, folder, list, and optional notes/date; extra settings are under **More options**. New tasks open in **All tasks**, including tasks without a date. **Done** keeps completed work.

The migration removes the old sample folders and lists only when their complete structure is unchanged, their timestamps match registration, and they have no tasks or notes. Customized names, extra or missing lists, later-created folders, notes, and task-bearing folders are preserved. It does not add replacement sample content.

## Shared work

- Separate user accounts, one owner per space, members, expiring invite links, and membership removal.
- Multiple projects in each space, with separate To do → Doing → Done boards. Status can also be changed in task details with keyboard or touch.
- Stories, tasks, and bugs with assignees, priority, story points, due dates, labels, descriptions, and acceptance criteria.
- Optional work plans with goals, dates, and closing notes. Each project can have one active plan, so several projects can run plans at the same time. Finishing a plan keeps completed work in its history and moves unfinished tasks to Later in the same project. Finished-plan tasks cannot be edited or deleted, preserving delivery reports.
- Task discussions, activity feed, team workload, status distribution, and delivered points for completed sprints.
- Project meetings with schedules, shared notes, task updates, and retained meeting history.
- Atomic CSV import into the selected project, up to 200 tasks / 500 KB per upload. Try `sample-tasks.csv`. Imported tasks are not assigned to a work plan; add them to a plan through task details if needed.
- Shared data refreshes every 10 seconds while the page is active. Task writes persist in the backend database. This is polling, not WebSocket collaboration; simultaneous edits use last-write-wins.

### Try locally on Windows

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
cd ../frontend
npm ci
cd ..
.\start-local.ps1 -SeedDemo
```

Open http://127.0.0.1:5173. The optional local demo login is **demo@zenos.example.com / ZenTeam2026!**. Demo teammates and tasks are sample data. The seed script only runs explicitly in development with SQLite, never at server startup or in production. Omit `-SeedDemo` to start with real accounts and an empty team workspace.

To collaborate: create a space, add projects, and share the invite link from **People**. Teammates follow the link, sign in or create an account, and join. You can also join by pasting an invite code. No emails are sent by the invite feature.

The launcher binds to the local machine only. Use the existing Render/Vercel deployment instructions for access from other computers, configure a private production database and a random `SECRET_KEY` of at least 32 characters, and run `alembic upgrade head` before starting the API. Production startup rejects a short or default signing secret. No production deployment is performed by local setup; localhost invite links work only on the same computer.

### Verification

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
cd ../frontend
npm run build
```

Integration tests use isolated SQLite databases with foreign-key enforcement. They cover access checks on every space endpoint, owner-only settings, independent plans across projects, project/plan relationship checks, scoped CSV imports, login and invite expiry, invite rotation, immediate membership revocation, meeting schedules and atomic reviews, retained task history, and an empty personal workspace with user-created folders and lists. Migration tests verify that existing personal and shared work survives upgrades, existing space work moves into General projects, meeting history can outlive deleted tasks, and only unchanged, unused sample folders and lists are removed. `alembic check` verifies that the migrated schema matches the models.

The inherited frontend build-tool and router dependencies still report npm audit advisories after compatible updates. Major dependency upgrades and a production security review remain before a public launch. This version does not include file attachments, email delivery, SSO, or Jira integrations.

## Stack

- Frontend: React, TypeScript, Tailwind CSS, Zustand, TanStack Query, React Router
- Backend: FastAPI, SQLAlchemy, Pydantic, JWT auth
- Database: SQLite for local development, PostgreSQL for production
- Migrations: Alembic

## Features

- JWT email/password auth with `/register`, `/login`, and `/me`
- Empty personal workspace with folders and lists you name yourself
- Folder and list CRUD with cascading deletes
- Task CRUD with daily or long-term type, due date, priority, estimated hours, progress, and completion state
- Completion checkbox auto-sets progress to 100 and moves tasks to completed views
- Today, Long-Term, Board, and Completed views
- Dashboard stats: completed today, pending, overdue, streak, folder progress, top active folder, suggested tasks
- Dark mode, responsive sidebar, search, and folder/list filters

## Project Structure

```text
backend/
  app/
    api/          FastAPI routers and dependencies
    core/         settings and security
    db/           SQLAlchemy session setup
    models/       ORM models
    schemas/      Pydantic schemas
    services/     task helpers
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

From the repository root, provide a private random signing secret before starting PostgreSQL and the backend. In PowerShell:

```powershell
$env:SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose config --quiet
docker compose up --build
```

Compose stops with an explanation if `SECRET_KEY` is missing or empty; the API also rejects values shorter than 32 characters in production mode. Keep the same secret for subsequent starts, either in your shell environment or as `SECRET_KEY=...` in the repository root's ignored `.env` file. Changing it signs everyone out. Do not commit or share it. `docker compose config --quiet` validates the configuration without starting services or printing the secret.

Then run the frontend with `npm run dev` from `frontend/`. The bundled database credentials and exposed database port are for local development; configure private credentials and network access before hosting this setup publicly.

## API Routes

Space APIs retain the `/teams` route name for compatibility:

- `GET /teams`, `POST /teams`
- `PUT /teams/{id}` (owner only; name and description)
- `GET /teams/invites/{code}` (public, minimal invite preview)
- `POST /teams/join` (requires login)
- `GET /teams/{id}/workspace` (all projects, members, tasks, plans, discussions, and activity for that space)
- `POST /teams/{id}/projects` (owner only)
- `POST /teams/{id}/rotate-invite` (owner only)
- `DELETE /teams/{id}/members/{user_id}` (owner only; owner cannot be removed)
- `POST /teams/{id}/issues`, `PUT /teams/{id}/issues/{issue_id}`, `DELETE /teams/{id}/issues/{issue_id}`
- `PATCH /teams/{id}/issues/{issue_id}/status`
- `POST /teams/{id}/issues/{issue_id}/comments`
- `POST /teams/{id}/sprints`, `PATCH /teams/{id}/sprints/{sprint_id}` (owner only)
- `POST /teams/{id}/import`
- `GET /teams/{id}/projects/{project_id}/meetings`, `POST /teams/{id}/projects/{project_id}/meetings`
- `PUT /teams/{id}/projects/{project_id}/meetings/{meeting_id}` (scheduled meeting details)
- `POST /teams/{id}/projects/{project_id}/meetings/{meeting_id}/review` (notes, task status updates, optional completion)

Task, plan, and import creation accepts `project_id`. Old clients that omit it use the first existing project; the owner must create a project before any tasks or plans can be added. Task updates that omit it keep the task's current project. Tasks cannot be reassigned to a different project or attached to another project's plan.

Personal workspace and authentication APIs:

The personal API keeps the names `categories` for folders and `subbranches` for lists for compatibility.

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
