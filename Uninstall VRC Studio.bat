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
echo    [3] Delete the Desktop copy of VRC Studio.exe (if any)
echo    [4] Delete the local 'release' build output (if any)
echo    [5] Leave the install folder (this one) for you to
echo        delete manually afterwards.
echo.
set "CONFIRM="
set /p CONFIRM=     Continue? [y/N]
if /i not "!CONFIRM!"=="y" if /i not "!CONFIRM!"=="yes" goto CANCEL

echo.
echo  [*] Closing running VRC Studio processes...
REM Kill any process named VRC Studio.exe (the packaged build).
taskkill /F /IM "VRC Studio.exe" >nul 2>nul
REM Also catch source-run electron.exe whose executable lives in this folder.
powershell -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like '%~dp0*') } | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 1 /nobreak >nul

echo  [*] Deleting user data...
if exist "%APPDATA%\vrc-studio" (
  rmdir /S /Q "%APPDATA%\vrc-studio"
  echo      Removed %APPDATA%\vrc-studio
) else (
  echo      No user data folder found (already clean).
)

echo  [*] Deleting Desktop shortcut/copy...
if exist "%USERPROFILE%\Desktop\VRC Studio.exe" (
  del /Q /F "%USERPROFILE%\Desktop\VRC Studio.exe"
  echo      Removed %USERPROFILE%\Desktop\VRC Studio.exe
) else (
  echo      No Desktop .exe found.
)
if exist "%USERPROFILE%\Desktop\VRC Studio.lnk" (
  del /Q /F "%USERPROFILE%\Desktop\VRC Studio.lnk"
  echo      Removed %USERPROFILE%\Desktop\VRC Studio.lnk
)

echo  [*] Deleting build output...
if exist "%~dp0release" (
  rmdir /S /Q "%~dp0release"
  echo      Removed %~dp0release
) else (
  echo      No build output to remove.
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
