@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\esip.exe" (
  echo ERROR: ESIP environment was not found. Please contact the ESIP administrator.
  pause
  exit /b 1
)
if not exist "output\reports\ESIP_Daily_Raw_Preview.xlsx" (
  echo ERROR: ESIP Preview was not found. Please run Run_ESIP_Daily.cmd first.
  pause
  exit /b 1
)
echo Checking ESIP publication readiness...
echo.
".venv\Scripts\esip.exe" publication-check --workbook "output\reports\ESIP_Daily_Raw_Preview.xlsx"
set "ESIP_RESULT=%ERRORLEVEL%"
echo.
if "%ESIP_RESULT%"=="0" (
  echo CHECK PASSED. Nothing was published or changed.
) else (
  echo CHECK FAILED. Nothing was published or changed.
)
echo.
pause
exit /b %ESIP_RESULT%
