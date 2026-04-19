# zenOS Deployment Checklist

This deploys the full stack:

- Frontend: Vercel
- Backend: Render
- Database: Neon Postgres or Supabase Postgres

## 1. Push to GitHub

Create a GitHub repository and push this project.

```bash
git init
git add .
git commit -m "Initial zenOS full-stack app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/zenOS.git
git push -u origin main
```

Do not commit `.env`, `node_modules`, `dist`, local SQLite files, or logs.

## 2. Create the Postgres Database

### Recommended: Neon

1. Create a Neon project.
2. Click **Connect**.
3. Copy the connection string.
4. Use the pooled connection string if you expect many concurrent users.

Neon URLs look like:

```env
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

The backend automatically converts this to SQLAlchemy's `psycopg` driver URL.

### Alternative: Supabase

1. Create a Supabase project.
2. Open **Connect** in the project dashboard.
3. For Render, prefer the pooler/session connection string if direct IPv6 is unavailable.
4. Copy the connection string and replace `[YOUR-PASSWORD]`.

## 3. Deploy Backend on Render

Use the included `render.yaml` when creating the service from GitHub, or configure manually:

- Service type: Web Service
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

Set these environment variables:

```env
ENVIRONMENT=production
DATABASE_URL=your_postgres_connection_string
SECRET_KEY=generate_a_long_random_secret
BACKEND_CORS_ORIGINS=https://your-vercel-app.vercel.app
```

After the first backend deploy, open:

```text
https://your-render-service.onrender.com/health
```

You should see:

```json
{"status":"ok"}
```

## 4. Deploy Frontend on Vercel

Create a Vercel project from the same GitHub repo:

- Framework preset: Vite
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`

Set:

```env
VITE_API_URL=https://your-render-service.onrender.com
```

Deploy the frontend.

## 5. Final CORS Update

Once Vercel gives you the final frontend URL, go back to Render and set:

```env
BACKEND_CORS_ORIGINS=https://your-vercel-app.vercel.app
```

If you also want local development to work against the deployed backend:

```env
BACKEND_CORS_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Save and redeploy the backend.

## 6. Smoke Test Production

1. Open the Vercel URL.
2. Register a new account.
3. Confirm the default categories appear.
4. Create a task.
5. Check the task complete.
6. Confirm dashboard counts update.

If registration works, the frontend, backend, auth, database, migrations, and CORS are all wired correctly.
