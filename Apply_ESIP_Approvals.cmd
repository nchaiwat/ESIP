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
echo Applying APPROVED rows from the ESIP Preview...
echo This will not approve PENDING rows and will not edit SAP Master Data.
echo.
".venv\Scripts\esip.exe" approval-check --workbook "output\reports\ESIP_Daily_Raw_Preview.xlsx"
if errorlevel 1 (
  echo.
  echo Validation failed. Nothing was changed.
  pause
  exit /b 1
)
echo.
choice /C YN /N /M "Apply the validated APPROVED rows? [Y/N]: "
if errorlevel 2 (
  echo Cancelled. Nothing was changed.
  pause
  exit /b 0
)
".venv\Scripts\esip.exe" apply-approvals --workbook "output\reports\ESIP_Daily_Raw_Preview.xlsx"
set "ESIP_RESULT=%ERRORLEVEL%"
echo.
if "%ESIP_RESULT%"=="0" (
  echo Approval application completed. An audit copy was retained.
) else (
  echo Approval application failed. Review the messages above.
)
echo.
pause
exit /b %ESIP_RESULT%
