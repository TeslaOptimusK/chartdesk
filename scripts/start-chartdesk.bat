@echo off
setlocal
REM ChartDesk — start Next.js on 43127 and open an app-style window.
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

set "APP_URL=http://127.0.0.1:43127"
set "OPENED=0"

REM Prefer Chrome / Edge app mode (frameless app window, not a browser tab).
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --new-window
  set "OPENED=1"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --new-window
  set "OPENED=1"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --new-window
  set "OPENED=1"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL% --new-window
  set "OPENED=1"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL% --new-window
  set "OPENED=1"
)

if "%OPENED%"=="0" (
  echo Chrome/Edge not found — opening default browser tab.
  start "" "%APP_URL%"
)

echo Starting ChartDesk on %APP_URL%
echo App window uses Chrome/Edge --app mode when available.
echo Keep this window open while using the app. Ctrl+C to stop.
call npm run dev -- -p 43127
pause
endlocal
