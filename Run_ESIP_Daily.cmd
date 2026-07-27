@echo off
cd /d "%~dp0"
echo ESIP Daily Run is starting...
echo.
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: ESIP Python environment was not found.
  echo Please contact the ESIP administrator.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" "scripts\run_daily.py"
set "ESIP_RESULT=%ERRORLEVEL%"
echo.
if "%ESIP_RESULT%"=="0" (
  echo ESIP Daily Run completed successfully.
  echo Open output\reports\ESIP_Daily_Raw_Preview.xlsx
) else (
  echo ESIP Daily Run stopped with an error.
  echo Open output\daily_runs\latest_run.md for the step that needs attention.
)
echo.
pause
exit /b %ESIP_RESULT%
