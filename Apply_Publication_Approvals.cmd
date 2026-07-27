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
echo Applying batch governance approvals from the ESIP Preview...
echo This command does NOT publish data.
echo.
".venv\Scripts\esip.exe" publication-check --workbook "output\reports\ESIP_Daily_Raw_Preview.xlsx"
if errorlevel 1 (
  echo.
  echo Validation failed. Nothing was changed.
  pause
  exit /b 1
)
choice /C YN /N /M "Apply validated governance approvals? [Y/N]: "
if errorlevel 2 (
  echo Cancelled. Nothing was changed.
  pause
  exit /b 0
)
".venv\Scripts\esip.exe" apply-publication-approvals --workbook "output\reports\ESIP_Daily_Raw_Preview.xlsx"
set "ESIP_RESULT=%ERRORLEVEL%"
echo.
if "%ESIP_RESULT%"=="0" (
  echo Governance approval completed. No data was published.
) else (
  echo Governance approval failed.
)
echo.
pause
exit /b %ESIP_RESULT%
