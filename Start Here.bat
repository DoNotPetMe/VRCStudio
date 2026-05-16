@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title VRC Studio - First-Run Setup

cls
echo.
echo  ===========================================================
echo.
echo     V R C   S T U D I O
echo     -------------------
echo     First-run setup (this only happens once)
echo.
echo  ===========================================================
echo.

REM --- Detect Node.js ----------------------------------------------
where node >nul 2>nul
if %errorlevel% equ 0 goto NODE_FOUND

echo  [!] Node.js was not found on your system.
echo      Node.js is required to run VRC Studio.
echo.
set "INSTALL_NODE="
set /p INSTALL_NODE=     Install Node.js automatically now? [Y/n]
if /i "!INSTALL_NODE!"=="n" goto ABORT
if /i "!INSTALL_NODE!"=="no" goto ABORT

echo.
echo  [*] Downloading Node.js installer (~30 MB)...
set "NODE_URL=https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
set "NODE_MSI=%TEMP%\vrcstudio-node-setup.msi"

powershell -NoProfile -Command "try { $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if %errorlevel% neq 0 (
  echo.
  echo  [!] Failed to download Node.js.
  echo      Install it manually from https://nodejs.org and re-run.
  goto ABORT
)

echo  [*] Launching Node.js installer. Accept any UAC prompts.
echo.
start /wait msiexec /i "%NODE_MSI%" /passive /norestart
set "MSI_RC=%errorlevel%"
del "%NODE_MSI%" >nul 2>nul

if not "%MSI_RC%"=="0" (
  echo.
  echo  [!] Node.js installer exited with code %MSI_RC%.
  echo      Re-run Start Here.bat once Node is installed.
  goto ABORT
)

echo.
echo  [*] Node.js installed successfully.
echo  [!] Close this window and double-click Start Here.bat again
echo      so Windows picks up the new PATH.
echo.
pause
exit /b 0

REM --- Node detected - install deps if needed ----------------------
:NODE_FOUND
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo  [*] Node.js detected: %NODE_VER%

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo  [!] npm is not on the PATH. Reopen this window or reinstall Node.js.
  goto ABORT
)

if not exist "node_modules" (
  echo  [*] First-time install - fetching dependencies, takes a few minutes...
  echo.
  call npm install
  if !errorlevel! neq 0 (
    echo.
    echo  [!] npm install failed. Try running 'npm install' manually.
    goto ABORT
  )
) else (
  echo  [*] Dependencies are already installed.
)

echo.
echo  ===========================================================
echo            Setup complete - launching VRC Studio
echo  ===========================================================
echo.
echo  Going forward, use:
echo    Launch VRC Studio.bat     to start the app
echo    Uninstall VRC Studio.bat  to cleanly remove user data
echo.

REM --- Launch via the permanent launcher ---------------------------
if exist "%~dp0Launch VRC Studio.bat" (
  start "" "%~dp0Launch VRC Studio.bat"
) else (
  start "" cmd /c "cd /d ""%~dp0"" & call npm start"
)

REM --- Self-destruct ----------------------------------------------
REM Spawn a detached cmd that waits 2 seconds then removes this script.
REM Inside cmd /C "..." the "" sequence is the escape for a literal quote.
start "" /B cmd /C "timeout /T 2 /NOBREAK >NUL & del /Q /F ""%~f0"""
exit /b 0

:ABORT
echo.
pause
exit /b 1
