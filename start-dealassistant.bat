@echo off
setlocal
title DealAssistant
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js 24 LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 22 (
  echo Node.js 22 or newer is required, but version %NODE_MAJOR% was found.
  echo Install Node.js 24 LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo No .env file found.
  echo Copy .env.example to .env and fill in your Discord credentials first.
  pause
  exit /b 1
)

if not exist "node_modules\discord.js" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm start
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo DealAssistant exited with code %EXIT_CODE%.
) else (
  echo DealAssistant stopped.
)
pause
exit /b %EXIT_CODE%
