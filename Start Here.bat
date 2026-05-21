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
echo     First-run setup
echo.
echo     This will install dependencies, build VRC Studio.exe,
echo     and optionally copy it to your Desktop.
echo.
echo  ===========================================================
echo.

REM ===================================================================
REM Flat control flow: no nested if-blocks, no parens inside echo
REM strings inside blocks, no else-if chains. cmd is brittle about all
REM three. Every branch is a GOTO.
REM ===================================================================

REM --- 1. Detect Node.js -------------------------------------------
where node >nul 2>nul
if %errorlevel% equ 0 goto NODE_FOUND

echo  [!] Node.js was not found on your system.
echo      Node.js is required to build VRC Studio.
echo.
set "INSTALL_NODE="
set /p INSTALL_NODE=     Install Node.js automatically now? [Y/n]
if /i "!INSTALL_NODE!"=="n"  goto ABORT
if /i "!INSTALL_NODE!"=="no" goto ABORT

echo.
echo  [*] Downloading Node.js installer ^(~30 MB^)...
set "NODE_URL=https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
set "NODE_MSI=%TEMP%\vrcstudio-node-setup.msi"

powershell -NoProfile -Command "try { $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if %errorlevel% neq 0 goto NODE_DOWNLOAD_FAILED

echo  [*] Launching Node.js installer. Accept any UAC prompts.
echo.
start /wait msiexec /i "%NODE_MSI%" /passive /norestart
del "%NODE_MSI%" >nul 2>nul

echo.
echo  [!] Node.js installed. Close this window and re-run Start Here.bat
echo      so Windows picks up the new PATH.
echo.
pause
exit /b 0

:NODE_DOWNLOAD_FAILED
echo.
echo  [!] Failed to download Node.js.
echo      Install it manually from https://nodejs.org and re-run.
goto ABORT

REM --- 2. Node is present ------------------------------------------
:NODE_FOUND
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo  [*] Node.js detected: %NODE_VER%

where npm >nul 2>nul
if %errorlevel% neq 0 goto NPM_MISSING

REM --- 3. Ask about Desktop placement (asked early so the user can walk away) ---
echo.
set "ADD_DESKTOP="
set /p ADD_DESKTOP=     Add VRC Studio.exe to your Desktop after build? [Y/n]
set "PLACE_DESKTOP=yes"
if /i "!ADD_DESKTOP!"=="n"  set "PLACE_DESKTOP=no"
if /i "!ADD_DESKTOP!"=="no" set "PLACE_DESKTOP=no"
echo  [*] Place on Desktop: !PLACE_DESKTOP!

REM --- 4. npm install ----------------------------------------------
if exist "node_modules" goto SKIP_INSTALL
echo.
echo  [*] Installing dependencies. This takes a few minutes the first time...
echo.
call npm install
if !errorlevel! neq 0 goto NPM_INSTALL_FAILED
goto DO_BUILD

:SKIP_INSTALL
echo  [*] Dependencies are already installed.

REM --- 5. Build VRC Studio.exe -------------------------------------
:DO_BUILD
echo.
echo  ===========================================================
echo    Building VRC Studio.exe
echo  ===========================================================
echo.
echo  [*] First time only: Electron binary ^(~80 MB^) will be downloaded.
echo      The whole build typically takes 3-5 minutes.
echo.

call npm run build
if !errorlevel! neq 0 goto BUILD_FAILED

REM --- 6. Locate the produced .exe ----------------------------------
set "EXE_PATH=%~dp0release\VRC Studio.exe"
if not exist "!EXE_PATH!" goto EXE_MISSING

echo  [*] Built: !EXE_PATH!

REM --- 7. Copy to Desktop if requested ------------------------------
set "DESKTOP_EXE="
if /i not "!PLACE_DESKTOP!"=="yes" goto DESKTOP_DONE
REM Resolve the REAL Desktop folder. %USERPROFILE%\Desktop is wrong when
REM OneDrive has redirected the Desktop known-folder.
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"
set "DESKTOP_EXE=!DESKTOP_DIR!\VRC Studio.exe"
copy /Y "!EXE_PATH!" "!DESKTOP_EXE!" >nul
if !errorlevel! neq 0 goto DESKTOP_COPY_FAILED
echo  [*] Copied to: !DESKTOP_EXE!
goto DESKTOP_DONE

:DESKTOP_COPY_FAILED
echo  [!] Couldn't copy to Desktop. The .exe is still at:
echo      !EXE_PATH!
set "DESKTOP_EXE="

:DESKTOP_DONE
echo.
echo  ===========================================================
echo            Setup complete!
echo  ===========================================================
echo.
echo  Your app:
echo    !EXE_PATH!
if defined DESKTOP_EXE echo    !DESKTOP_EXE!
echo.
echo  The source folder is no longer needed to run VRC Studio -
echo  the .exe is self-contained. Keep it around if you want to
echo  re-build later, or delete it.
echo.
echo  To cleanly remove everything later, use
echo  "Uninstall VRC Studio.bat" left next to this one.
echo.
echo  Launching VRC Studio now...
echo.

REM --- 8. Launch the new exe ---------------------------------------
if defined DESKTOP_EXE start "" "!DESKTOP_EXE!"
if not defined DESKTOP_EXE start "" "!EXE_PATH!"

REM --- 9. Self-destruct --------------------------------------------
REM We launched the .exe above, so this script is no longer needed.
REM Spawn a detached cmd that waits 2 seconds then removes us.
start "" /B cmd /C "timeout /T 2 /NOBREAK >NUL & del /Q /F ""%~f0"""
exit /b 0

REM --- Error labels -------------------------------------------------

:NPM_MISSING
echo  [!] npm is not on the PATH. Reopen the window or reinstall Node.js.
goto ABORT

:NPM_INSTALL_FAILED
echo.
echo  [!] npm install failed. Try running 'npm install' manually.
goto ABORT

:BUILD_FAILED
echo.
echo  [!] Build failed.
echo      If you saw a 'symbolic link' or 'privilege not held' error,
echo      enable Windows Developer Mode ^(Settings ^> For developers^)
echo      and re-run, or run Start Here.bat as Administrator.
goto ABORT

:EXE_MISSING
echo  [!] Couldn't locate VRC Studio.exe at !EXE_PATH!
echo      Look in the 'release' folder for the actual filename.
goto ABORT

:ABORT
echo.
pause
exit /b 1
