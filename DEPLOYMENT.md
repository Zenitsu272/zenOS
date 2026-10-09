# Deploy zenOS

Update the existing **Vercel frontend** and **Render API** connected to [Zenitsu272/zenOS](https://github.com/Zenitsu272/zenOS). Keep the existing PostgreSQL database and deploy the API before the frontend. The repository includes [render.yaml](render.yaml) and [Vercel routing](frontend/vercel.json).

Current production: [zen-os-pi.vercel.app](https://zen-os-pi.vercel.app) → [zenos-api.onrender.com](https://zenos-api.onrender.com). The Vercel project is `zenitsu272s-projects/zen-os`, connected to `main`. The existing Render service uses `backend/Dockerfile`, which supplies Python 3.12 and runs migrations before the API. The native Python settings below also support new services using the blueprint.

## 1. Prepare the release

- Run the backend tests with `python -m pytest -q` from `backend` using its development environment, and run `npm ci` followed by `npm run build` from `frontend`.
- Back up the production database before upgrading. Push the reviewed changes to the GitHub branch connected to both hosting projects.
- Keep `.env`, database files, credentials, logs, `node_modules`, and build output out of Git. Do not seed demo accounts or tasks in production.

## 2. Update the Render API

Use the existing service with these settings, or apply the included Render blueprint:

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Python runtime | 3.12, pinned by `backend/.python-version` |
| Build command | `pip install -r requirements.txt` |
| Start command | `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/health` |

Set these variables on the backend service:

```env
ENVIRONMENT=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
SECRET_KEY=YOUR_PRIVATE_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
BACKEND_CORS_ORIGINS=https://zen-os-pi.vercel.app
```

Use the existing PostgreSQL connection string from your provider. The backend accepts `postgres://`, `postgresql://`, and `postgresql+psycopg://` URLs. Do not use local SQLite as the hosted production database.

Keep the existing private signing secret when updating a working service. For a new service, the blueprint generates `SECRET_KEY`; a manually configured value must be random and at least 32 characters. Production startup rejects short or default secrets. Changing the secret signs everyone out. Keep database credentials and this secret only in backend configuration; never place them in a frontend `VITE_` variable.

`BACKEND_CORS_ORIGINS` is a comma-separated list of exact frontend origins, including `https://`, with no path or trailing slash. Include the production custom domain and Vercel domain if both are used. Add a specific preview origin only when that preview needs API access; do not use `*`. Redeploy the API after environment changes.

### Database migrations

The start command applies migrations before starting the API. This release must reach **`0006_remove_empty_defaults`**:

| Migration | Result |
| --- | --- |
| `0001_initial` | Accounts and personal tasks |
| `0002_team_workspaces` | Shared spaces, members, tasks, and work plans |
| `0003_space_projects` | Space owners, expiring invites, and projects; existing shared work moves into General |
| `0004_empty_personal_workspace` | Removes only unchanged, unused sample folders/lists; preserves customized or used content |
| `0005_space_meetings` | Space descriptions, project meetings, and retained task-change history |
| `0006_remove_empty_defaults` | Removes only empty automatic General projects; keeps projects containing work and manually created projects |

Check the deploy logs for a successful upgrade. If the service shell is available, run `alembic current` and confirm `0006_remove_empty_defaults (head)`. Do not bypass migration failures by stamping the database or resetting it.

After deployment, [the API health check](https://zenos-api.onrender.com/health) should return `{"status":"ok"}`. This checks that the API is running; the smoke checks below verify authentication and database-backed features.

## 3. Update the Vercel frontend

Use the existing project with:

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | `frontend` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |

Set the production frontend environment variable to the deployed API origin, without a trailing slash:

```env
VITE_API_URL=https://zenos-api.onrender.com
```

Deploy or rebuild after changing it: Vite embeds this value in the frontend build. The included rewrite to `/index.html` must remain enabled so direct visits and reloads at `/login`, `/personal`, and `/join/INVITE_CODE` work.

Make sure the final frontend origin matches Render's CORS configuration. Share invite links copied from the hosted frontend; `localhost` links work only on the computer that created them.

## 4. Smoke-check the hosted app

Use test accounts and test content:

1. **Authentication and personal work:** Register, sign out, and sign in. A new account's `/personal` workspace is empty. Create a folder, a list, and a task with no due date; confirm it appears in All tasks, survives reload, and moves to Done when completed.
2. **Spaces and projects:** Create a space and confirm it starts with no projects and a clear first-project action. Edit its name/description and add two projects. Create a task in each; confirm their boards stay separate and existing space data remains after reload.
3. **Invitations and access:** Copy an invite from People. In a separate browser session, open it, register or log in, and confirm it opens the invited space. Confirm this member can update project tasks but cannot edit space settings or manage invitations. A separate, uninvited account must not see or fetch that space.
4. **Revocation:** Replace the invite link and confirm the previous link no longer joins. Remove the test member and confirm their access is blocked even while signed in. Invite links expire after seven days; replacing a link creates a fresh one.
5. **Meetings:** Schedule a project meeting with an agenda and call link. Reload and verify its local start/end times. Save notes and a task status change, complete the meeting, and confirm both the board and Completed meeting history update. Add a further task update from the completed meeting; earlier history must remain unchanged. Tasks in finished work plans must remain protected.
6. **Navigation:** Reload a project screen, `/personal`, and an invitation URL directly. Confirm no SPA routing errors, failed API requests, or CORS errors appear.

Invitations are shared links, not automatic emails. Meeting links open the chosen external service; zenOS does not create external calls, send calendar invitations, or deliver reminders. Email verification, password recovery, and SSO are not included. See [README.md](README.md) for the full feature and access model.
