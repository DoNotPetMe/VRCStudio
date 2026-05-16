@echo off
title VRC Studio - Uninstaller
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ===========================================================
echo    V R C   S T U D I O   -   U n i n s t a l l e r
echo  ===========================================================
echo.
echo  This will:
echo    [1] Close any running VRC Studio process
echo    [2] Delete user data (cookies, settings, cache) at:
echo        %APPDATA%\vrc-studio
echo    [3] Leave the install folder (this one) for you to
echo        delete manually afterwards.
echo.
set "CONFIRM="
set /p CONFIRM=     Continue? [y/N]
if /i not "!CONFIRM!"=="y" if /i not "!CONFIRM!"=="yes" goto CANCEL

echo.
echo  [*] Closing running VRC Studio processes...
REM Kill any process whose executable lives in this install folder.
REM Catches both the source-run electron.exe and any packaged build.
powershell -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like '%~dp0*') } | Stop-Process -Force -ErrorAction SilentlyContinue"
taskkill /F /IM "VRC Studio.exe" >nul 2>nul
timeout /t 1 /nobreak >nul

echo  [*] Deleting user data...
if exist "%APPDATA%\vrc-studio" (
  rmdir /S /Q "%APPDATA%\vrc-studio"
  echo      Removed %APPDATA%\vrc-studio
) else (
  echo      No user data folder found (already clean).
)

echo.
echo  ===========================================================
echo                  Uninstall complete
echo  ===========================================================
echo.
echo  All app-managed data has been removed.
echo  You can now delete this folder manually if you wish:
echo      %~dp0
echo.
pause
exit /b 0

:CANCEL
echo.
echo  Cancelled. Nothing was changed.
pause
exit /b 1
