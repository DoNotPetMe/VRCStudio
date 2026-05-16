@echo off
setlocal enabledelayedexpansion
title VRC Studio - Applying update...

REM Args:
REM   %1 = path to the downloaded source zip
REM   %2 = install root (where setup.bat lives)
REM   %3 = PID of the app process we need to wait on
REM   %4 = SHA we're applying (written to .vrcstudio-version.json on success)

set "ZIP_PATH=%~1"
set "INSTALL_DIR=%~2"
set "APP_PID=%~3"
set "TARGET_SHA=%~4"

if not exist "%ZIP_PATH%"     ( echo  [!] zip not found: %ZIP_PATH%  & goto :FAIL )
if not exist "%INSTALL_DIR%"  ( echo  [!] install dir missing: %INSTALL_DIR%  & goto :FAIL )

echo.
echo  =====================================================
echo    V R C   S t u d i o   -   U p d a t i n g
echo  =====================================================
echo.
echo  [*] Waiting for VRC Studio to close...

REM ─── 1. Wait for the previous app process to exit ─────────────────────
set "WAIT_TICKS=0"
:WAIT_LOOP
tasklist /FI "PID eq %APP_PID%" 2>NUL | find "%APP_PID%" >NUL
if errorlevel 1 goto :APP_GONE
set /a WAIT_TICKS+=1
if %WAIT_TICKS% gtr 30 (
  echo  [!] App still running after 30s. Force-killing PID %APP_PID%...
  taskkill /F /PID %APP_PID% >NUL 2>NUL
  goto :APP_GONE
)
timeout /t 1 /nobreak >NUL
goto :WAIT_LOOP

:APP_GONE
echo  [*] App closed.
echo  [*] Extracting update payload...

REM ─── 2. Extract the zip to a temp directory ───────────────────────────
set "EXTRACT_DIR=%TEMP%\vrcstudio-update-%RANDOM%%RANDOM%"
mkdir "%EXTRACT_DIR%" >NUL 2>NUL

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%EXTRACT_DIR%' -Force"

if %errorlevel% neq 0 (
  echo  [!] Extraction failed.
  goto :CLEANUP_FAIL
)

REM GitHub source zips extract to a single subdir like "VRCStudio-<branch>".
REM Find it and use its contents as our source.
set "SOURCE_DIR="
for /d %%D in ("%EXTRACT_DIR%\*") do (
  set "SOURCE_DIR=%%D"
  goto :GOT_SOURCE
)
:GOT_SOURCE
if "%SOURCE_DIR%"=="" (
  echo  [!] Couldn't find the extracted source directory.
  goto :CLEANUP_FAIL
)

echo  [*] Copying new files into %INSTALL_DIR%...

REM ─── 3. Copy the new source over the install, preserving heavy dirs ───
REM Exclude:
REM   node_modules   - 100+ MB; we re-run npm install after to pick up changes
REM   dist           - rebuilt by npm start anyway
REM   dist-electron  - same
REM   .git           - keep the user's clone state intact
REM /MIR mirrors src onto dst (deletes orphans). We use /E + /XD instead so
REM     local-only files (logs, customisations) survive.
robocopy "%SOURCE_DIR%" "%INSTALL_DIR%" /E /XD node_modules dist dist-electron .git /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >NUL
set "RC=%errorlevel%"
REM robocopy exit codes 0-7 are success (8+ means real errors)
if %RC% geq 8 (
  echo  [!] File copy reported errors (robocopy %RC%).
  goto :CLEANUP_FAIL
)

echo  [*] Files updated.
echo  [*] Running npm install to pick up any new dependencies...
echo.

REM ─── 4. Refresh dependencies ──────────────────────────────────────────
cd /d "%INSTALL_DIR%"
call npm install
if %errorlevel% neq 0 (
  echo.
  echo  [!] npm install failed. The new code is in place, but you may need
  echo      to run 'npm install' manually before the app will start.
  goto :WRITE_VERSION
)

:WRITE_VERSION
REM Stamp the version marker so the renderer can show "now on <sha>".
>"%INSTALL_DIR%\.vrcstudio-version.json" echo {"commit":"%TARGET_SHA%","appliedAt":"%DATE% %TIME%"}

echo.
echo  =====================================================
echo    Update complete - relaunching VRC Studio
echo  =====================================================
echo.

REM ─── 5. Cleanup + relaunch ────────────────────────────────────────────
rmdir /s /q "%EXTRACT_DIR%" >NUL 2>NUL
del "%ZIP_PATH%" >NUL 2>NUL

start "" "%INSTALL_DIR%\setup.bat"
exit /b 0

:CLEANUP_FAIL
rmdir /s /q "%EXTRACT_DIR%" >NUL 2>NUL
del "%ZIP_PATH%" >NUL 2>NUL

:FAIL
echo.
echo  =====================================================
echo    Update FAILED
echo  =====================================================
echo.
echo  Your existing install was not modified. You can:
echo    - Try again from inside the app (Settings - Updates)
echo    - Re-download from GitHub manually
echo.
pause
exit /b 1
