@echo off
setlocal
REM ChartDesk — start Next.js on 43127 and open the browser.
REM Works from any cwd; resolves repo root from this script's location.

cd /d "%~dp0.."
if errorlevel 1 (
  echo Failed to cd to repo root from "%~dp0.."
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found on PATH. Install Node.js LTS, then re-run.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" "http://127.0.0.1:43127"
echo Starting ChartDesk on http://127.0.0.1:43127
echo Keep this window open while using the app. Ctrl+C to stop.
call npm run dev -- -p 43127
pause
endlocal
