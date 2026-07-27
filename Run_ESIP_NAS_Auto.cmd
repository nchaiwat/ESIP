@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" exit /b 2
set "ESIP_EXTERNAL_RAW_PATH=\\wa-nas-it03\FileShare-2\SaleOut_RPT"
set "ESIP_NAS_LOOKBACK_DAYS=2"
".venv\Scripts\python.exe" "scripts\sync_nas_raw.py"
exit /b %ERRORLEVEL%
