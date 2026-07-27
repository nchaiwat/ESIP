@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pwa\scripts\Stop-ESIPLocal.ps1"
if errorlevel 1 pause
endlocal
