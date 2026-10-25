# Block inbound TCP 43127 so other machines cannot reach ChartDesk.
# Windows Firewall does not filter loopback, so this PC's browser still connects.
# Does not change RDP, SSH, or any other port.
# Run from an elevated PowerShell: scripts\harden-chartdesk.ps1

$ErrorActionPreference = "Stop"
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Administrator rights are required to add a firewall rule. Open PowerShell as Administrator and run this script again."
  exit 1
}

$ruleName = "ChartDesk: block inbound 43127"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Block `
    -Protocol TCP `
    -LocalPort 43127 `
    -Profile Any `
    -Enabled True `
    -Description "ChartDesk is a local trading terminal. Block inbound TCP 43127 from other machines. Loopback is unaffected." | Out-Null
  Write-Output "created=$ruleName"
} else {
  Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Block -Profile Any | Out-Null
  Write-Output "updated=$ruleName"
}

Get-NetFirewallRule -DisplayName $ruleName |
  ForEach-Object { Write-Output ("enabled=" + $_.Enabled + " action=" + $_.Action + " direction=" + $_.Direction) }
