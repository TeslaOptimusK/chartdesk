# Creates/overwrites a Desktop shortcut "ChartDesk.lnk".
# The shortcut runs wscript so no command prompt is shown.
# Run once after clone:
#   powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$vbsPath = Join-Path $repoRoot "scripts\chartdesk-launch.vbs"
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"

if (-not (Test-Path -LiteralPath $vbsPath)) {
  throw "Missing launcher: $vbsPath"
}
if (-not (Test-Path -LiteralPath $wscript)) {
  throw "Missing wscript: $wscript"
}

$desktop = [Environment]::GetFolderPath("Desktop")
if ([string]::IsNullOrWhiteSpace($desktop) -or -not (Test-Path -LiteralPath $desktop)) {
  $desktop = Join-Path $env:USERPROFILE "Desktop"
}

$lnkPath = Join-Path $desktop "ChartDesk.lnk"
$iconPath = Join-Path $repoRoot "public\chartdesk.ico"
if (-not (Test-Path -LiteralPath $iconPath)) {
  throw "Missing icon: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $wscript
$shortcut.Arguments = "//nologo `"$vbsPath`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Start ChartDesk (http://127.0.0.1:43127)"
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Save()

Write-Host "Created: $lnkPath"
Write-Host "Target:  $wscript $vbsPath"
Write-Host "WorkDir: $repoRoot"
Write-Host "Icon:    $iconPath"
