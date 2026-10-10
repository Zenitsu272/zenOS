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

### Enable email codes with Brevo

Deploy the API and frontend first with the default `AUTH_MODE=password`. The frontend reads `/auth/config` so existing sign-in continues working until email delivery is configured. Then set these variables on the **Render backend** and redeploy:

```env
AUTH_MODE=otp
BREVO_API_KEY=YOUR_PRIVATE_BREVO_API_KEY
BREVO_SENDER_EMAIL=YOUR_BREVO_VERIFIED_EMAIL_ADDRESS
BREVO_SENDER_NAME=ZenOS
OTP_DAILY_SEND_LIMIT=200
```

Use a Brevo **API key**, not an SMTP key. The service sends through Brevo's [transactional HTTPS API](https://developers.brevo.com/reference/send-transac-email); standard SMTP ports are blocked on [Render's free tier](https://render.com/docs/free). The sender address must already be verified in Brevo. Recipients see **ZenOS** as the sender name, with the subject **Your ZenOS sign-in code**. Keep the API key only in Render's secret environment settings, never in Git, browser code, a `VITE_` variable, or screenshots.

After activation, `/auth/config` must return `{"method":"email_otp"}`. Open the hosted login page, request a code for an address you own, and check the actual inbox (including spam). Enter that code and verify that the existing account's spaces and personal work remain available. Confirm a used code cannot sign in again and test an invitation in a signed-out browser. A successful request means Brevo accepted the email, not that it reached the inbox; if delivery fails, check the sender and Brevo transaction logs.

Codes last 10 minutes and are single-use. Resending after 60 seconds replaces the previous code. Incorrect attempts and email requests are limited in the database, so restarting or adding workers does not reset protection. The daily send cap defaults to 200 across zenOS; adjust it to fit the Brevo account's allowance and any other apps sharing that account. The API uses the connection's client address for additional rate limits and does not trust arbitrary forwarded headers. Behind a shared proxy, those address limits can apply to multiple users. Configure only known, trusted proxies if changing Uvicorn's forwarded-header handling.

Existing accounts and signed-in sessions are retained; keep `SECRET_KEY` unchanged. New accounts are created only after their email code is verified. In OTP mode, the old password registration and login endpoints are disabled. Password mode is a deployment compatibility option, not a recovery method for accounts created through OTP; restore email delivery if those users cannot sign in. No fixed code, production code preview, or email-delivery bypass is provided.

### Database migrations

The start command applies migrations before starting the API. This release must reach **`0010_issue_assigned_date`**:

| Migration | Result |
| --- | --- |
| `0001_initial` | Accounts and personal tasks |
| `0002_team_workspaces` | Shared spaces, members, tasks, and work plans |
| `0003_space_projects` | Space owners, expiring invites, and projects; existing shared work moves into General |
| `0004_empty_personal_workspace` | Removes only unchanged, unused sample folders/lists; preserves customized or used content |
| `0005_space_meetings` | Space descriptions, project meetings, and retained task-change history |
| `0006_remove_empty_defaults` | Removes only empty automatic General projects; keeps projects containing work and manually created projects |
| `0007_email_otp` | Adds email-code challenges and persistent rate limits; preserves accounts and workspace data |
| `0008_project_memberships` | Adds project membership; enrolls existing assignees who still belong to the space, preserving assignments |
| `0009_empty_legacy_folders` | Removes only empty registration-era legacy folders; preserves every folder containing a list or task and logs the removed count |
| `0010_issue_assigned_date` | Adds a separate optional assigned date to shared tasks; existing tasks remain undated and deadlines and statuses are preserved |

Check the deploy logs for a successful upgrade. If the service shell is available, run `alembic current` and confirm `0010_issue_assigned_date (head)`. Do not bypass migration failures by stamping the database or resetting it.

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

1. **Authentication and personal work:** Request and verify an email code, sign out, and sign in with a fresh code. Test an existing account and a new account. A new account's `/personal` workspace is empty. Create a folder, a list, and a task with no due date; confirm it appears in All tasks, survives reload, and moves to Done when completed.
2. **Spaces and projects:** Create a space and confirm it starts with no projects and a clear first-project action. Edit its name/description and add two projects. Join one project and confirm immediate membership; only joined people appear as task assignees. Confirm the other project remains visible, but joining one does not enroll people in the other. Create a task in each; confirm their boards stay separate and existing space data remains after reload.
3. **Invitations and access:** Copy an invite from People. In a separate browser session, open it, register or log in, and confirm it opens the invited space. Confirm this member can update project tasks but cannot edit space settings or manage invitations. A separate, uninvited account must not see or fetch that space.
4. **Revocation:** Remove the test member and confirm their access is blocked even while signed in, their project memberships are removed, and the invite link and expiry remain unchanged. A valid shared link can let them rejoin the space; they must join projects again. Explicitly replace the invite link and confirm the previous link no longer joins. Invite links expire after seven days; replacing a link creates a fresh one.
5. **Meetings:** Schedule a project meeting with an agenda and call link. Reload and verify its local start/end times. Save notes and a task status change, complete the meeting, and confirm both the board and Completed meeting history update. Add a further task update from the completed meeting; earlier history must remain unchanged. Tasks in finished work plans must remain protected.
6. **Navigation:** Reload a project screen, `/personal`, and an invitation URL directly. Confirm no SPA routing errors, failed API requests, or CORS errors appear.

Invitations are shared links, not automatic emails. Meeting links open the chosen external service; zenOS does not create external calls, send calendar invitations, or deliver reminders. Email-code sign-in requires no password recovery. SSO is not included. See [README.md](README.md) for the full feature and access model.
