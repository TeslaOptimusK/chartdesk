# Creates/overwrites a Desktop shortcut "ChartDesk.lnk" -> scripts\start-chartdesk.bat
# Run once after clone:
#   powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$batPath = Join-Path $repoRoot "scripts\start-chartdesk.bat"

if (-not (Test-Path -LiteralPath $batPath)) {
  throw "Missing launcher: $batPath"
}

$desktop = [Environment]::GetFolderPath("Desktop")
if ([string]::IsNullOrWhiteSpace($desktop) -or -not (Test-Path -LiteralPath $desktop)) {
  $desktop = Join-Path $env:USERPROFILE "Desktop"
}

$lnkPath = Join-Path $desktop "ChartDesk.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
$shortcut.Description = "Start ChartDesk app window (http://127.0.0.1:43127)"
$shortcut.Save()

Write-Host "Created: $lnkPath"
Write-Host "Target:  $batPath"
Write-Host "WorkDir: $repoRoot"
Write-Host "Launcher opens Chrome/Edge --app mode when available."
