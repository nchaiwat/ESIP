@echo off
cd /d "%~dp0"
set "ESIP_PREVIEW=output\reports\ESIP_Daily_Raw_Preview.xlsx"
if not exist "%ESIP_PREVIEW%" (
  echo ESIP Preview was not found.
  echo Please run Run_ESIP_Daily.cmd first.
  echo.
  pause
  exit /b 1
)
start "" "%ESIP_PREVIEW%"
exit /b 0
