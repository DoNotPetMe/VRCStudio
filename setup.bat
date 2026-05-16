@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title VRC Studio - Setup

echo.
echo  =====================================================
echo    V R C   S T U D I O   -   F i r s t   R u n   S e t u p
echo  =====================================================
echo.

REM ─── 1. Detect Node.js ────────────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_FOUND

echo  [!] Node.js was not found on your system.
echo      Node.js is required to run VRC Studio.
echo.
set "INSTALL_NODE="
set /p INSTALL_NODE=     Install Node.js automatically now? [Y/n]
if /i "!INSTALL_NODE!"=="n"  goto :ABORT
if /i "!INSTALL_NODE!"=="no" goto :ABORT

echo.
echo  [*] Downloading the Node.js installer (~30 MB)...
echo      from https://nodejs.org
echo.

set "NODE_URL=https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
set "NODE_MSI=%TEMP%\vrcstudio-node-setup.msi"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue';" ^
  "try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 }" ^
  "catch { Write-Host $_.Exception.Message; exit 1 }"

if %errorlevel% neq 0 (
  echo.
  echo  [!] Failed to download Node.js.
  echo      Install it manually from https://nodejs.org and re-run this setup.
  goto :ABORT
)

echo  [*] Launching the Node.js installer.
echo      Accept any UAC prompts. The installer's defaults are fine.
echo.

start /wait msiexec /i "%NODE_MSI%" /passive /norestart
set "MSI_RC=%errorlevel%"
del "%NODE_MSI%" >nul 2>nul

if not "%MSI_RC%"=="0" (
  echo.
  echo  [!] Node.js installer exited with code %MSI_RC%.
  echo      If you cancelled it, just re-run setup once Node is installed.
  goto :ABORT
)

echo.
echo  [*] Node.js installed successfully.
echo  [!] Windows needs this command window to be reopened for the new
echo      PATH to be picked up. Close this window, then double-click
echo      setup.bat again.
echo.
pause
exit /b 0

REM ─── 2. Node detected — install deps if needed ────────────────────────
:NODE_FOUND
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo  [*] Node.js detected: %NODE_VER%

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo  [!] npm is not on the PATH. Reopen this window or reinstall Node.js.
  goto :ABORT
)

if not exist "node_modules" (
  echo  [*] First-time install — fetching dependencies, this takes a few minutes...
  echo.
  call npm install
  if %errorlevel% neq 0 (
    echo.
    echo  [!] npm install failed. Try running 'npm install' manually.
    goto :ABORT
  )
) else (
  echo  [*] Dependencies are already installed.
)

echo.
echo  =====================================================
echo    Setup complete - launching VRC Studio
echo  =====================================================
echo.

call npm run electron:dev
set "RUN_RC=%errorlevel%"
if not "%RUN_RC%"=="0" (
  echo.
  echo  [!] The app exited with code %RUN_RC%.
  echo      Scroll up to see the error; the most common cause is that
  echo      Node.js modules need rebuilding for your platform.
  echo      Try: npm rebuild
  pause
)
exit /b %RUN_RC%

:ABORT
echo.
pause
exit /b 1
