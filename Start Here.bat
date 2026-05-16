@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title VRC Studio - First-Run Setup

REM Enable ANSI escape codes so the logo can use colour on Win10+
for /F "tokens=1,* delims= " %%a in ('echo prompt $E^| cmd') do if "%%b"=="" set "ESC=%%a"

cls
echo.
echo  %ESC%[91m╔═════════════════════════════════════════════════╗%ESC%[0m
echo  %ESC%[91m║                                                 ║%ESC%[0m
echo  %ESC%[91m║    ██╗   ██╗██████╗   ██████╗                   ║%ESC%[0m
echo  %ESC%[91m║    ██║   ██║██╔══██╗ ██╔════╝                   ║%ESC%[0m
echo  %ESC%[91m║    ██║   ██║██████╔╝ ██║                        ║%ESC%[0m
echo  %ESC%[91m║    ╚██╗ ██╔╝██╔══██╗ ██║                        ║%ESC%[0m
echo  %ESC%[91m║     ╚████╔╝ ██║  ██║ ╚██████╗                   ║%ESC%[0m
echo  %ESC%[91m║      ╚═══╝  ╚═╝  ╚═╝  ╚═════╝   S T U D I O     ║%ESC%[0m
echo  %ESC%[91m║                                                 ║%ESC%[0m
echo  %ESC%[91m╚═════════════════════════════════════════════════╝%ESC%[0m
echo            %ESC%[90mFirst-run setup - this only happens once%ESC%[0m
echo.

REM ─── 1. Detect Node.js ────────────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_FOUND

echo  %ESC%[93m[!] Node.js was not found on your system.%ESC%[0m
echo      Node.js is required to run VRC Studio.
echo.
set "INSTALL_NODE="
set /p INSTALL_NODE=     Install Node.js automatically now? [Y/n]
if /i "!INSTALL_NODE!"=="n"  goto :ABORT_KEEP
if /i "!INSTALL_NODE!"=="no" goto :ABORT_KEEP

echo.
echo  %ESC%[96m[*]%ESC%[0m Downloading the Node.js installer (~30 MB)...
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
  echo  %ESC%[91m[!] Failed to download Node.js.%ESC%[0m
  echo      Install it manually from https://nodejs.org and re-run Start Here.bat.
  goto :ABORT_KEEP
)

echo  %ESC%[96m[*]%ESC%[0m Launching the Node.js installer.
echo      Accept any UAC prompts. The installer's defaults are fine.
echo.

start /wait msiexec /i "%NODE_MSI%" /passive /norestart
set "MSI_RC=%errorlevel%"
del "%NODE_MSI%" >nul 2>nul

if not "%MSI_RC%"=="0" (
  echo.
  echo  %ESC%[91m[!] Node.js installer exited with code %MSI_RC%.%ESC%[0m
  echo      Re-run Start Here.bat once Node is installed.
  goto :ABORT_KEEP
)

echo.
echo  %ESC%[92m[*]%ESC%[0m Node.js installed successfully.
echo  %ESC%[93m[!]%ESC%[0m Windows needs this command window to be reopened for the new
echo      PATH to be picked up. Close this window, then double-click
echo      Start Here.bat again.
echo.
pause
exit /b 0

REM ─── 2. Node detected — install deps ──────────────────────────────────
:NODE_FOUND
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo  %ESC%[92m[*]%ESC%[0m Node.js detected: %NODE_VER%

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo  %ESC%[91m[!]%ESC%[0m npm is not on the PATH. Reopen this window or reinstall Node.js.
  goto :ABORT_KEEP
)

if not exist "node_modules" (
  echo  %ESC%[96m[*]%ESC%[0m First-time install — fetching dependencies, takes a few minutes...
  echo.
  call npm install
  if %errorlevel% neq 0 (
    echo.
    echo  %ESC%[91m[!]%ESC%[0m npm install failed. Try running 'npm install' manually.
    goto :ABORT_KEEP
  )
) else (
  echo  %ESC%[92m[*]%ESC%[0m Dependencies are already installed.
)

REM ─── 3. Create the permanent launcher + uninstaller ───────────────────
echo  %ESC%[96m[*]%ESC%[0m Creating shortcuts...

> "Launch VRC Studio.bat" (
  echo @echo off
  echo title VRC Studio
  echo cd /d "%%~dp0"
  echo where node ^>nul 2^>nul
  echo if %%errorlevel%% neq 0 ^(
  echo   echo Node.js is missing. Run "Start Here.bat" first.
  echo   pause
  echo   exit /b 1
  echo ^)
  echo if not exist "node_modules" ^(
  echo   echo Dependencies are missing. Run "Start Here.bat" first.
  echo   pause
  echo   exit /b 1
  echo ^)
  echo call npm start
  echo if %%errorlevel%% neq 0 ^(
  echo   echo.
  echo   echo The app exited with an error. See above for details.
  echo   pause
  echo ^)
)

REM Switch off delayed expansion for the next block so `!VAR!` writes
REM literally to the generated uninstaller (rather than expanding here).
setlocal disabledelayedexpansion

> "Uninstall VRC Studio.bat" (
  echo @echo off
  echo title VRC Studio - Uninstaller
  echo setlocal enabledelayedexpansion
  echo cd /d "%%~dp0"
  echo.
  echo echo.
  echo echo  =====================================================
  echo echo    V R C   S t u d i o   -   U n i n s t a l l e r
  echo echo  =====================================================
  echo echo.
  echo echo  This will:
  echo echo    [1] Close any running VRC Studio process
  echo echo    [2] Delete user data ^(cookies, settings, cache^) at
  echo echo        %%APPDATA%%\vrc-studio
  echo echo    [3] Leave the install folder ^(this one^) for you to
  echo echo        delete manually afterwards.
  echo echo.
  echo set "CONFIRM="
  echo set /p CONFIRM=     Continue? [y/N]
  echo if /i not "!CONFIRM!"=="y" if /i not "!CONFIRM!"=="yes" goto :CANCEL
  echo.
  echo echo  [*] Closing running VRC Studio processes...
  echo REM Kill any process whose executable lives inside this install folder.
  echo REM Catches both the source-run electron.exe and any packaged build.
  echo powershell -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue ^| Where-Object { $_.Path -and ($_.Path -like '%%~dp0*') } ^| Stop-Process -Force -ErrorAction SilentlyContinue"
  echo taskkill /F /IM "VRC Studio.exe" ^>nul 2^>nul
  echo timeout /t 1 /nobreak ^>nul
  echo.
  echo echo  [*] Deleting user data...
  echo if exist "%%APPDATA%%\vrc-studio" ^(
  echo   rmdir /S /Q "%%APPDATA%%\vrc-studio"
  echo   echo      Removed %%APPDATA%%\vrc-studio
  echo ^) else ^(
  echo   echo      No user data folder found ^(already clean^).
  echo ^)
  echo.
  echo echo  =====================================================
  echo echo    Uninstall complete
  echo echo  =====================================================
  echo echo.
  echo echo  All app-managed data has been removed.
  echo echo  You can now delete this folder manually if you wish:
  echo echo      %%~dp0
  echo echo.
  echo pause
  echo exit /b 0
  echo.
  echo :CANCEL
  echo echo.
  echo echo  Cancelled. Nothing was changed.
  echo pause
  echo exit /b 1
)

endlocal

echo.
echo  %ESC%[92m═════════════════════════════════════════════════════%ESC%[0m
echo            %ESC%[92mSetup complete!%ESC%[0m
echo  %ESC%[92m═════════════════════════════════════════════════════%ESC%[0m
echo.
echo  Two new files have been created next to this one:
echo.
echo    %ESC%[96mLaunch VRC Studio.bat%ESC%[0m    - double-click to start the app
echo    %ESC%[96mUninstall VRC Studio.bat%ESC%[0m - cleanly remove user data
echo.
echo  Launching VRC Studio now, then closing this window...
echo.

REM ─── 4. Start the app via the new permanent launcher ──────────────────
start "" "%~dp0Launch VRC Studio.bat"

REM ─── 5. Self-destruct ─────────────────────────────────────────────────
REM Spawn a detached cmd that waits 2 seconds (giving us time to exit and
REM the launcher time to spin up) then removes this script. Inside the
REM cmd /c string, "" is the escape for a literal quote.
start "" /B cmd /C "timeout /T 2 /NOBREAK >NUL 2>NUL & del /Q /F ""%~f0"""
exit /b 0

REM ─── Aborts that should NOT self-delete (user needs to re-run) ────────
:ABORT_KEEP
echo.
pause
exit /b 1
