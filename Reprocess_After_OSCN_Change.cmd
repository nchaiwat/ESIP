@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: ESIP environment was not found. Please contact the ESIP administrator.
  pause
  exit /b 1
)
echo Checking whether OSCN changed...
echo Historical data will only be rebuilt when the OSCN file hash is different.
echo Published batches will never be rebuilt automatically.
echo.
".venv\Scripts\python.exe" "scripts\reprocess_after_oscn.py"
set "ESIP_RESULT=%ERRORLEVEL%"
echo.
if "%ESIP_RESULT%"=="0" (
  echo OSCN reprocess check completed.
) else (
  echo OSCN reprocess failed. The previous database state was restored.
)
echo.
pause
exit /b %ESIP_RESULT%
