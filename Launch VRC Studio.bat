@echo off
title VRC Studio
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is not installed. Run "Start Here.bat" first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Dependencies are missing. Run "Start Here.bat" first.
  pause
  exit /b 1
)

call npm start
if %errorlevel% neq 0 (
  echo.
  echo The app exited with an error. See above for details.
  pause
)
exit /b
