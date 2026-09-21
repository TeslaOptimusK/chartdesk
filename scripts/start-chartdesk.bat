@echo off
setlocal EnableExtensions
REM ChartDesk launcher. Fast-forward cursor/chartdesk-desktop, then keep Next.js
REM alive, wait for /api/bootstrap, and open Chrome/Edge in --app= mode.
REM Does not reset or discard local edits.

cd /d "%~dp0.."
if errorlevel 1 goto fail_cd

if /I "%~1"=="--updated" goto launch

where git >nul 2>&1
if errorlevel 1 goto fail_git

set "GIT_TERMINAL_PROMPT=0"
REM This block is parsed before it runs, so a pull that replaces this file
REM cannot desync the rest of the update. The new file is started afterwards.
(
  echo Fetching latest ChartDesk...
  git fetch origin
  if errorlevel 1 (
    echo git fetch failed. Check the network, then double-click ChartDesk again.
    echo Local files were not reset.
    pause
    exit /b 1
  )
  git rev-parse --verify --quiet refs/heads/cursor/chartdesk-desktop >nul 2>&1
  if errorlevel 1 (
    git checkout -b cursor/chartdesk-desktop --track origin/cursor/chartdesk-desktop
  ) else (
    git checkout cursor/chartdesk-desktop
  )
  if errorlevel 1 (
    echo Could not checkout cursor/chartdesk-desktop.
    echo Local edits may be in the way. They were not discarded.
    pause
    exit /b 1
  )
  git pull --ff-only origin cursor/chartdesk-desktop
  if errorlevel 1 (
    echo Fast-forward pull failed. The local branch may have diverged from origin.
    echo Nothing was reset.
    pause
    exit /b 1
  )
  start "ChartDesk" cmd /c call "%~f0" --updated
  exit /b 0
)

:launch
where node >nul 2>&1
if errorlevel 1 goto fail_node

set "NEED_NPM=0"
if not exist "node_modules\next\" set "NEED_NPM=1"
if exist "package-lock.json" if exist "node_modules\.chartdesk-package-lock.json" (
  fc /b "package-lock.json" "node_modules\.chartdesk-package-lock.json" >nul 2>&1
  if errorlevel 1 set "NEED_NPM=1"
)
if exist "package.json" if exist "node_modules\.chartdesk-package.json" (
  fc /b "package.json" "node_modules\.chartdesk-package.json" >nul 2>&1
  if errorlevel 1 set "NEED_NPM=1"
)
if "%NEED_NPM%"=="1" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto fail_npm
)
if exist "node_modules\" (
  if exist "package-lock.json" copy /y "package-lock.json" "node_modules\.chartdesk-package-lock.json" >nul
  if exist "package.json" copy /y "package.json" "node_modules\.chartdesk-package.json" >nul
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

echo Stopping a previous ChartDesk server on %APP_URL% if one is listening...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":%APP_PORT%" ^| findstr /C:"LISTENING"') do (
  echo Stopping PID %%P
  taskkill /F /PID %%P >nul 2>&1
)
taskkill /F /T /FI "WINDOWTITLE eq ChartDesk Server" >nul 2>&1

echo Starting ChartDesk on %APP_URL%
echo Server window title: ChartDesk Server. Leave it open. Ctrl+C there to stop.

REM /k keeps the console open if npm exits so errors stay visible.
REM Bind 127.0.0.1 explicitly so localhost/::1 does not miss the health check.
start "ChartDesk Server" cmd /k "npm run dev -- -H %APP_HOST% -p %APP_PORT%"

set /a "TRIES=0"
:wait_ready
set /a "TRIES+=1"
if %TRIES% GTR 90 goto fail_boot
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%BOOT_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_ready
)

echo Bootstrap OK: %BOOT_URL%

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
echo ChartDesk is running. Close the ChartDesk Server window or Ctrl+C there to stop.
echo This launcher window can stay open or be closed; the server window is separate.
pause
endlocal
exit /b 0

:fail_cd
echo Failed to cd to repo root from "%~dp0.."
pause
exit /b 1

:fail_git
echo git not found on PATH. Install Git for Windows, then re-run.
pause
exit /b 1

:fail_node
echo Node.js not found on PATH. Install Node.js LTS, then re-run.
pause
exit /b 1

:fail_npm
echo npm install failed.
pause
exit /b 1

:fail_boot
echo.
echo Server did not become ready: %BOOT_URL%
echo Check the ChartDesk Server window for npm/Next errors.
pause
exit /b 1
