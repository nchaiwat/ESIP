$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$workspacePath = Split-Path -Parent $projectPath
$localUrl = "http://localhost:3000"

if (-not (Get-Command docker-compose.exe -ErrorAction SilentlyContinue)) {
    throw "Docker Compose was not found. Install or open Docker Desktop first."
}

& docker-compose.exe -f (Join-Path $workspacePath "docker-compose.yml") up -d --build
if ($LASTEXITCODE -ne 0) {
    throw "ESIP Local could not start. Please confirm that Docker Desktop is running."
}

$ready = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # Containers are still starting.
    }
}

if (-not $ready) {
    & docker-compose.exe -f (Join-Path $workspacePath "docker-compose.yml") ps
    throw "ESIP Local did not become ready."
}

Start-Process $localUrl
Write-Host "ESIP Local PWA is ready at $localUrl"
Write-Host "Administrator and Sale Admin confirmations apply immediately."
Write-Host "Use Stop_ESIP_Local.cmd when finished."
