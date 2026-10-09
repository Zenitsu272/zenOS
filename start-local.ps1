param([switch]$SeedDemo)
$ErrorActionPreference = 'Stop'
$workspaceRoot = $PSScriptRoot
$backendPath = Join-Path $workspaceRoot 'backend'
$frontendPath = Join-Path $workspaceRoot 'frontend'
$pythonPath = Join-Path $backendPath '.venv\Scripts\python.exe'
if (!(Test-Path $pythonPath)) { throw 'Set up backend/.venv and install backend/requirements-dev.txt first. See README.md.' }
if (!(Test-Path (Join-Path $frontendPath 'node_modules\vite\bin\vite.js'))) { throw 'Run npm ci in frontend first.' }
foreach ($port in @(8000, 5173)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use. The app may already be running at http://127.0.0.1:5173."
    }
}
# Use a local database regardless of unrelated DATABASE_URL variables on this machine.
$env:DATABASE_URL = 'sqlite:///./zenos.db'
$env:ENVIRONMENT = 'development'
$env:BACKEND_CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
Push-Location $backendPath
try {
    & $pythonPath -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    if ($SeedDemo) {
        & $pythonPath seed_demo.py
        if ($LASTEXITCODE -ne 0) { throw 'Demo setup failed.' }
    }
} finally { Pop-Location }
$apiProcess = Start-Process -FilePath $pythonPath -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backendPath 'server.log') -RedirectStandardError (Join-Path $backendPath 'server-error.log') -PassThru
$nodePath = (Get-Command node).Source
$vitePath = Join-Path $frontendPath 'node_modules\vite\bin\vite.js'
$uiProcess = Start-Process -FilePath $nodePath -ArgumentList "`"$vitePath`"",'--host','127.0.0.1','--port','5173','--strictPort' -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $frontendPath 'server.log') -RedirectStandardError (Join-Path $frontendPath 'server-error.log') -PassThru
Write-Host "zenOS: http://127.0.0.1:5173 (API launcher PID $($apiProcess.Id), frontend PID $($uiProcess.Id)). Logs are in backend/ and frontend/."
