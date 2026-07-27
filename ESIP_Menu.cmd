@echo off
cd /d "%~dp0"
:menu
cls
echo ========================================
echo ESIP - Daily Operations
echo ========================================
echo 1. Run Daily Update
echo 2. Open Latest Excel Result
echo 3. Check Mapping Approvals
echo 4. Check Publication Readiness
echo 5. Check OSCN and Reprocess if Changed
echo 6. Prepare Today's HH Download Folder
echo 7. Open ESIP Local App
echo 8. Stop ESIP Local App
echo 9. Exit
echo.
choice /C 123456789 /N /M "Select [1-9]: "
if errorlevel 9 exit /b 0
if errorlevel 8 goto stopapp
if errorlevel 7 goto openapp
if errorlevel 6 goto hhfolder
if errorlevel 5 goto reprocess
if errorlevel 4 goto publication
if errorlevel 3 goto mapping
if errorlevel 2 goto open
if errorlevel 1 goto daily
goto menu

:daily
call "Run_ESIP_Daily.cmd"
goto menu

:open
call "Open_ESIP_Result.cmd"
goto menu

:mapping
call "Check_ESIP_Approvals.cmd"
goto menu

:publication
call "Check_Publication_Readiness.cmd"
goto menu

:reprocess
call "Reprocess_After_OSCN_Change.cmd"
goto menu

:hhfolder
call "Prepare_HH_Download_Folder.cmd"
goto menu

:openapp
call "Start_ESIP_Local.cmd"
goto menu

:stopapp
call "Stop_ESIP_Local.cmd"
goto menu
