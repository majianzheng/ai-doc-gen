# deploy.ps1 - Deploy ai-doc to a remote Linux server using Docker Compose
#
# Usage (PowerShell):
#   .\deploy.ps1
#   .\deploy.ps1 -Server root@10.88.8.201 -RemotePath /opt/ai-doc
#
# Requirements:
#   - Passwordless SSH login already configured (ssh-copy-id) for $Server
#   - Remote server has Docker + docker compose plugin installed
#   - Windows OpenSSH client (ssh.exe / scp.exe) available
#
# What it does:
#   1. Create the remote directory
#   2. Transfer the build context (Dockerfile, compose file, configs, src/)
#   3. Copy local .env on first deploy only (server .env is never overwritten)
#   4. docker compose up -d --build on the server
#   5. Wait for the container healthcheck, then print endpoints

param(
    [string]$Server = "root@10.88.8.201",
    [string]$RemotePath = "/opt/ai-doc"
)

$ErrorActionPreference = 'Stop'

# Resolve project root (the directory containing this script)
$LocalPath = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Sanity checks
function Require-Command($cmd, $name) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "error: $name not found. Install the Windows OpenSSH client."
        exit 1
    }
}
Require-Command ssh.exe 'ssh'
Require-Command scp.exe 'scp'

if (-not (Test-Path "$LocalPath\src")) {
    Write-Error "error: src\ not found under $LocalPath"
    exit 1
}

Write-Host "==> Deploying ai-doc to $Server`:$RemotePath" -ForegroundColor Cyan

# 1. Remote directory
Write-Host "==> Ensuring remote directory exists" -ForegroundColor Cyan
ssh.exe $Server "mkdir -p '$RemotePath'"

# 2. Transfer build context (no lockfiles; .dockerignore excludes them on the server)
$files = @('Dockerfile', 'docker-compose.yml', '.dockerignore', '.env.example', 'package.json', 'tsconfig.json', 'src', 'scripts')
foreach ($f in $files) {
    Write-Host "  -> $f" -ForegroundColor Gray
    scp.exe -r "$LocalPath\$f" "${Server}:$RemotePath/"
}

# 3. .env (first-time setup only; never overwrite server .env)
if (Test-Path "$LocalPath\.env") {
    $exists = ssh.exe $Server "test -f '$RemotePath/.env' && echo yes || echo no"
    if ($exists -match 'yes') {
        Write-Host "==> Server .env already exists, leaving it unchanged" -ForegroundColor Cyan
    } else {
        Write-Host "==> Copying local .env (first-time setup)" -ForegroundColor Cyan
        scp.exe -q "$LocalPath\.env" "${Server}:$RemotePath/.env"
    }
} else {
    Write-Host "==> No local .env; server will use docker-compose defaults" -ForegroundColor Cyan
}

# 4. Build & start
# Force a clean rebuild (--no-cache) so the image always reflects the latest
# source. A plain `up --build` can otherwise reuse a cached `RUN npm run build`
# layer and ship stale code.
Write-Host "==> Running: docker compose build --no-cache && docker compose up -d" -ForegroundColor Cyan
$tmpOut = Join-Path $env:TEMP "ai-doc-compose.out"
$tmpErr = Join-Path $env:TEMP "ai-doc-compose.err"
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& ssh.exe $Server "cd '$RemotePath' && docker compose build --no-cache && docker compose up -d" > $tmpOut 2> $tmpErr
$exit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
$composeOut = (Get-Content $tmpOut -ErrorAction SilentlyContinue) -join "`n"
$composeErr = (Get-Content $tmpErr -ErrorAction SilentlyContinue) -join "`n"
if ($exit -ne 0) {
    Write-Host "ERROR: docker compose build/up failed:" -ForegroundColor Red
    Write-Host $composeOut
    Write-Host $composeErr
    exit 1
}

# 5. Wait for health
$Container = "ai-doc"   # container_name set in docker-compose.yml
Write-Host "==> Waiting for container healthcheck" -ForegroundColor Cyan
$ok = $false
for ($i = 1; $i -le 40; $i++) {
    $status = ssh.exe $Server "docker inspect -f '{{.State.Health.Status}}' '$Container' 2>/dev/null || echo unknown"
    if ($status -match 'healthy') { $ok = $true; break }
    if ($status -match 'unhealthy') {
        Write-Host "ERROR: container reported 'unhealthy'. Check logs:" -ForegroundColor Red
        Write-Host "  ssh $Server `"cd '$RemotePath' && docker compose logs --tail 100`"" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 3
}

if (-not $ok) {
    Write-Host "ERROR: container not healthy within 120s. Check logs:" -ForegroundColor Red
    Write-Host "  ssh $Server `"cd '$RemotePath' && docker compose logs --tail 100`"" -ForegroundColor Red
    exit 1
}

# Done
$ip = $Server.Split('@')[-1]
# NOTE: these commands run in the remote *bash* shell, so use `head`, not a PowerShell cmdlet.
$portLine = ssh.exe $Server "docker port '$Container' 9000 2>/dev/null | head -1"
$publicPort = if ($portLine -match ':(\d+)$') { $Matches[1] } else { '9100' }
$adminPortLine = ssh.exe $Server "docker port '$Container' 9800 2>/dev/null | head -1"
$adminPublicPort = if ($adminPortLine -match ':(\d+)$') { $Matches[1] } else { '9800' }

Write-Host ""
Write-Host "===== DEPLOY COMPLETE =====" -ForegroundColor Green
Write-Host "  MCP endpoint   : http://$ip`:$publicPort/mcp"
Write-Host "  REST API       : http://$ip`:$publicPort/api/documents/:format"
Write-Host "  Health check   : http://$ip`:$publicPort/health"
Write-Host "  Admin UI       : http://$ip`:$adminPublicPort/  (separate management port)"
Write-Host ""
Write-Host "  Remote path    : $RemotePath"
Write-Host "  Container      : $Container"
Write-Host "  Manage         : ssh $Server `"cd '$RemotePath' && docker compose down`""
Write-Host "  Logs (follow)  : ssh $Server `"cd '$RemotePath' && docker compose logs -f`""
Write-Host ""
Write-Host "  Override settings via .env on the server (PORT, STORAGE_MODE, S3_*, LOCAL_*, ...), then re-run this script." -ForegroundColor Gray
