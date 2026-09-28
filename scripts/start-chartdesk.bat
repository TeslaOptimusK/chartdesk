@echo off
setlocal EnableExtensions
REM ChartDesk launcher. Fast-forward cursor/chartdesk-desktop, then start Next.js
REM with no console, wait for /api/bootstrap, and open Chrome/Edge in --app= mode.
REM A double-click from an old shortcut closes its console and continues hidden.
REM Does not reset or discard local edits.

cd /d "%~dp0.."
if errorlevel 1 goto fail_cd

if /I "%~1"=="--updated" goto launch
if /I "%~1"=="--hidden" goto hidden_start

REM Old Desktop shortcut targets this bat and opens a console. Hand off and exit.
wscript //nologo "%~dp0chartdesk-launch.vbs"
exit /b 0

:hidden_start
call :hide_console
wscript //nologo "%~dp0chartdesk-launch.vbs" shortcut

where git >nul 2>&1
if errorlevel 1 goto fail_git

set "GIT_TERMINAL_PROMPT=0"
REM This repo clears credential.helper. Use GitHub CLI when it is installed so
REM a double-click can fetch without asking the user to run git.
if exist "C:\Program Files\GitHub CLI\gh.exe" (
  set "GIT_CONFIG_COUNT=1"
  set "GIT_CONFIG_KEY_0=credential.helper"
  set "GIT_CONFIG_VALUE_0=!'C:\Program Files\GitHub CLI\gh.exe' auth git-credential"
)
REM This block is parsed before it runs, so a pull that replaces this file
REM cannot desync the rest of the update. The new file is started afterwards.
(
  git fetch origin
  if errorlevel 1 (
    wscript //nologo "%~dp0chartdesk-launch.vbs" alert "ChartDesk could not download the update. Check the network, then open ChartDesk again. Local files were not reset."
    exit /b 1
  )
  git rev-parse --verify --quiet refs/heads/cursor/chartdesk-desktop >nul 2>&1
  if errorlevel 1 (
    git checkout -b cursor/chartdesk-desktop --track origin/cursor/chartdesk-desktop
  ) else (
    git checkout cursor/chartdesk-desktop
  )
  if errorlevel 1 (
    wscript //nologo "%~dp0chartdesk-launch.vbs" alert "ChartDesk could not switch to the desktop branch. Local edits were not discarded."
    exit /b 1
  )
  git pull --ff-only origin cursor/chartdesk-desktop
  if errorlevel 1 (
    wscript //nologo "%~dp0chartdesk-launch.vbs" alert "ChartDesk could not fast-forward. The local branch may have diverged. Nothing was reset."
    exit /b 1
  )
  wscript //nologo "%~dp0chartdesk-launch.vbs" updated
  exit /b 0
)

:launch
call :hide_console
wscript //nologo "%~dp0chartdesk-launch.vbs" shortcut
where node >nul 2>&1
if errorlevel 1 goto fail_node

REM Default to delayed Yahoo quotes unless the user already set a mode.
if not defined MARKET_DATA_MODE set "MARKET_DATA_MODE=delayed"

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
if not exist "data\" mkdir data
if "%NEED_NPM%"=="1" (
  call npm install >> "data\chartdesk-server.log" 2>&1
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

REM Stop a previous server on this port. Hidden servers have no window title.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":%APP_PORT%" ^| findstr /C:"LISTENING"') do (
  taskkill /F /PID %%P >nul 2>&1
)
taskkill /F /T /FI "WINDOWTITLE eq ChartDesk Server" >nul 2>&1

if not exist "data\" mkdir data
wscript //nologo "%~dp0chartdesk-launch.vbs" server

set /a "TRIES=0"
:wait_ready
set /a "TRIES+=1"
if %TRIES% GTR 90 goto fail_boot
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%BOOT_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_ready
)

set "OPENED="
if defined CHROME (
  start "" "%CHROME%" "--app=%APP_URL%"
  set "OPENED=1"
) else if defined EDGE (
  start "" "%EDGE%" "--app=%APP_URL%"
  set "OPENED=1"
)

if not defined OPENED start "" "%APP_URL%"

endlocal
exit /b 0

:hide_console
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0hide-console.ps1" >nul 2>&1
exit /b 0

:fail_cd
set "ALERT=ChartDesk could not find its folder."
goto fail_alert

:fail_git
set "ALERT=Git was not found. Install Git for Windows, then open ChartDesk again."
goto fail_alert

:fail_node
set "ALERT=Node.js was not found. Install Node.js LTS, then open ChartDesk again."
goto fail_alert

:fail_npm
set "ALERT=ChartDesk could not install dependencies. See data\chartdesk-server.log after the next try, or run npm install in the ChartDesk folder."
goto fail_alert

:fail_boot
set "ALERT=ChartDesk did not finish starting. See data\chartdesk-server.log in the ChartDesk folder."
goto fail_alert

:fail_alert
echo %ALERT%
wscript //nologo "%~dp0chartdesk-launch.vbs" alert "%ALERT%"
endlocal
exit /b 1
