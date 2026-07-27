$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$workspacePath = Split-Path -Parent $projectPath
$composePath = Join-Path $workspacePath "docker-compose.yml"

if (-not (Get-Command docker-compose.exe -ErrorAction SilentlyContinue)) {
    throw "Docker Compose was not found."
}

& docker-compose.exe -f $composePath down
if ($LASTEXITCODE -ne 0) {
    throw "ESIP Local could not be stopped."
}

Write-Host "ESIP Local has been stopped. Saved data was retained."
