@echo off
setlocal EnableExtensions
REM ChartDesk — start Next.js on 43127 and open Chrome/Edge in --app= window mode.
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
set "CHROME="
set "EDGE="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

echo Starting ChartDesk on %APP_URL%
echo Keep this window open while using the app. Ctrl+C to stop.

REM Start the Next.js server in a separate minimized console so we can wait then open --app=.
start "ChartDesk Server" /MIN cmd /c "npm run dev -- -p 43127"

REM Wait until the HTTP port answers (up to ~60s).
set /a "TRIES=0"
:wait_ready
set /a "TRIES+=1"
if %TRIES% GTR 60 (
  echo Server did not become ready on %APP_URL%
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_ready
)

REM Open as a desktop-like app window. Quote --app= so Windows start does not strip it.
REM Do NOT use bare `start http://...` — that always opens a normal browser tab.
set "OPENED="
if defined CHROME (
  start "ChartDesk" "%CHROME%" "--app=%APP_URL%"
  set "OPENED=1"
  echo Opened ChartDesk via Chrome --app=%APP_URL%
) else if defined EDGE (
  start "ChartDesk" "%EDGE%" "--app=%APP_URL%"
  set "OPENED=1"
  echo Opened ChartDesk via Edge --app=%APP_URL%
)

if not defined OPENED (
  echo Chrome/Edge not found. Install Chrome or Edge for --app= window mode.
  echo Falling back to default browser ^(tab^) as last resort.
  start "" "%APP_URL%"
)

echo.
echo ChartDesk is running. Close the "ChartDesk Server" window or end node to stop.
pause
endlocal
