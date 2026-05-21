@echo off
title VRC Studio - Uninstaller
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Resolve the REAL Desktop folder. %USERPROFILE%\Desktop is wrong when
REM OneDrive has redirected the Desktop known-folder.
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"

echo.
echo  ===========================================================
echo    V R C   S T U D I O   -   U n i n s t a l l e r
echo  ===========================================================
echo.
echo  This will:
echo    [1] Close VRC Studio if it is running
echo    [2] Delete user data (settings, cache, cookies, history)
echo    [3] Delete VRC Studio.exe from your Desktop
echo    [4] Delete the local 'release' build output
echo.
echo  Your Desktop: !DESKTOP_DIR!
echo.
set "CONFIRM="
set /p CONFIRM=     Continue? [y/N]
if /i not "!CONFIRM!"=="y" if /i not "!CONFIRM!"=="yes" goto CANCEL

echo.
echo  [*] Closing VRC Studio...
REM Kill the packaged build by image name, and any source-run electron.exe
REM whose executable lives inside this install folder.
taskkill /F /IM "VRC Studio.exe" >nul 2>nul
powershell -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like '%~dp0*') } | Stop-Process -Force -ErrorAction SilentlyContinue"
REM Give Windows a moment to release file locks before we delete.
timeout /t 2 /nobreak >nul

echo  [*] Deleting user data...
REM Source runs (electron .) store under %APPDATA%\vrc-studio.
REM Packaged builds (productName "VRC Studio") store under %APPDATA%\VRC Studio.
REM Remove both so it's clean regardless of how the app was launched.
set "REMOVED_DATA="
if exist "%APPDATA%\vrc-studio" (
  rmdir /S /Q "%APPDATA%\vrc-studio"
  echo      Removed %APPDATA%\vrc-studio
  set "REMOVED_DATA=1"
)
if exist "%APPDATA%\VRC Studio" (
  rmdir /S /Q "%APPDATA%\VRC Studio"
  echo      Removed %APPDATA%\VRC Studio
  set "REMOVED_DATA=1"
)
if not defined REMOVED_DATA echo      No user data found (already clean).

echo  [*] Deleting Desktop copy...
set "DESK_EXE=!DESKTOP_DIR!\VRC Studio.exe"
if exist "!DESK_EXE!" (
  del /Q /F "!DESK_EXE!" >nul 2>nul
  if exist "!DESK_EXE!" (
    echo      [!] Could not delete it - VRC Studio may still be running.
    echo          Close it fully ^(check the system tray^) and re-run.
  ) else (
    echo      Removed !DESK_EXE!
  )
) else (
  echo      No Desktop copy found.
)
if exist "!DESKTOP_DIR!\VRC Studio.lnk" del /Q /F "!DESKTOP_DIR!\VRC Studio.lnk" >nul 2>nul

echo  [*] Deleting build output...
if exist "%~dp0release" (
  rmdir /S /Q "%~dp0release"
  echo      Removed the 'release' folder
) else (
  echo      No build output to remove.
)

echo.
echo  ===========================================================
echo                  Uninstall complete
echo  ===========================================================
echo.
echo  All app-managed data has been removed. You can now delete
echo  this source folder yourself:
echo      %~dp0
echo.
pause
exit /b 0

:CANCEL
echo.
echo  Cancelled. Nothing was changed.
pause
exit /b 1
