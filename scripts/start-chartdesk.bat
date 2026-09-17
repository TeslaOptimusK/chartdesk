@echo off
setlocal EnableExtensions
REM ChartDesk — keep Next.js alive in a titled console, health-check /api/bootstrap,
REM then open Chrome/Edge in --app= window mode.

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

set "APP_HOST=127.0.0.1"
set "APP_PORT=43127"
set "APP_URL=http://%APP_HOST%:%APP_PORT%"
set "BOOT_URL=%APP_URL%/api/bootstrap"
set "CHROME="
set "EDGE="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

echo Starting ChartDesk on %APP_URL%
echo Server window title: ChartDesk Server — leave it open. Ctrl+C there to stop.

REM /k keeps the console open if npm exits so errors stay visible.
REM Bind 127.0.0.1 explicitly (avoid localhost/::1 vs 127.0.0.1 mismatch).
REM Do NOT use cmd /c — that closes the window when the process dies and looks "running" from this launcher.
start "ChartDesk Server" cmd /k "npm run dev -- -H %APP_HOST% -p %APP_PORT%"

REM Wait until bootstrap API returns HTTP 200 (up to ~90s). Root HTML alone is not enough —
REM SSR can paint "로딩 중…" while /api/bootstrap or client JS still fails.
set /a "TRIES=0"
:wait_ready
set /a "TRIES+=1"
if %TRIES% GTR 90 (
  echo.
  echo Server did not become ready: %BOOT_URL%
  echo Check the "ChartDesk Server" window for npm/Next errors.
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%BOOT_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_ready
)

echo Bootstrap OK: %BOOT_URL%

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
echo ChartDesk is running. Close the "ChartDesk Server" window or Ctrl+C there to stop.
echo This launcher window can stay open or be closed; the server window is separate.
pause
endlocal
