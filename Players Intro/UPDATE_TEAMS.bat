@echo off
title Updating Team Categories & Transparent Player Photos...
echo ============================================================
echo   SIKAT PLAYERS INTRO - AUTOMATIC TEAM & TRANSPARENT UPDATER
echo ============================================================
echo.
echo Scanning "teams" folder and generating web presets...
python build_teams.py
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo   SUCCESS! All transparent photos & teams have been updated.
    echo   Simply refresh index.html in your browser to see changes!
    echo ============================================================
) else (
    echo.
    echo [ERROR] Python failed to update teams. Please ensure Python is installed.
)
echo.
pause

