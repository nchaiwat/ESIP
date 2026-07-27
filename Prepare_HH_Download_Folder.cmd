@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: ESIP environment was not found. Please contact the ESIP administrator.
  pause
  exit /b 1
)
set "HH_FOLDER="
for /f "delims=" %%I in ('.venv\Scripts\python.exe scripts\prepare_hh_download.py') do set "HH_FOLDER=%%I"
if not defined HH_FOLDER (
  echo ERROR: The HH download folder could not be prepared.
  pause
  exit /b 1
)
echo HH download folder is ready:
echo %HH_FOLDER%
echo.
echo Save SaleReport.xlsx and StockReport.xlsx in this folder.
start "" "%HH_FOLDER%"
exit /b 0
