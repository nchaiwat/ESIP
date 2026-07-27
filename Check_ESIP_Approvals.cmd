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
echo Checking ESIP approval workbook...
echo.
".venv\Scripts\esip.exe" approval-check --workbook "output\reports\ESIP_Daily_Raw_Preview.xlsx"
set "ESIP_RESULT=%ERRORLEVEL%"
echo.
if "%ESIP_RESULT%"=="0" (
  echo CHECK PASSED. No files were changed.
) else (
  echo CHECK FAILED. No files were changed.
)
echo.
pause
exit /b %ESIP_RESULT%
