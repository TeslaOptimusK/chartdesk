# Read-only posture check for the PC that runs ChartDesk.
# Prints status only. Does not change firewall rules, services, or files.
# Does not print secret values.

$ErrorActionPreference = "Continue"
Write-Output "=== ChartDesk security audit ==="
Write-Output ("time=" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"))
Write-Output ("user=" + $env:USERNAME)
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ("elevated=" + $admin)

Write-Output "=== Defender ==="
try {
  $mp = Get-MpComputerStatus
  Write-Output ("AntivirusEnabled=" + $mp.AntivirusEnabled)
  Write-Output ("RealTimeProtection=" + $mp.RealTimeProtectionEnabled)
  Write-Output ("IoavProtection=" + $mp.IoavProtectionEnabled)
  Write-Output ("NIS=" + $mp.NISEnabled)
  Write-Output ("SignaturesOutOfDate=" + $mp.DefenderSignaturesOutOfDate)
} catch {
  Write-Output ("defender_error=" + $_.Exception.Message)
}

Write-Output "=== Firewall profiles ==="
Get-NetFirewallProfile | ForEach-Object {
  Write-Output ($_.Name + " enabled=" + $_.Enabled + " inbound=" + $_.DefaultInboundAction)
}
$rule = Get-NetFirewallRule -DisplayName "ChartDesk: block inbound 43127" -ErrorAction SilentlyContinue
if ($rule) {
  Write-Output ("chartdesk_port_rule=" + $rule.Enabled + " action=" + $rule.Action)
} else {
  Write-Output "chartdesk_port_rule=absent"
}

Write-Output "=== ChartDesk port 43127 ==="
$desk = @(Get-NetTCPConnection -LocalPort 43127 -State Listen -ErrorAction SilentlyContinue)
if ($desk.Count -eq 0) {
  Write-Output "listen=none"
} else {
  foreach ($conn in $desk) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "?" }
    $loopback = $conn.LocalAddress -in @("127.0.0.1", "::1")
    Write-Output ("listen addr=" + $conn.LocalAddress + " pid=" + $conn.OwningProcess + " name=" + $name + " loopback=" + $loopback)
  }
}

Write-Output "=== Other non-loopback listeners ==="
$listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -ne "127.0.0.1" -and $_.LocalAddress -ne "::1" }
$listen | Group-Object LocalPort | Sort-Object { [int]$_.Name } | ForEach-Object {
  $sample = $_.Group | Select-Object -First 1
  $proc = Get-Process -Id $sample.OwningProcess -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { "?" }
  $addrs = ($_.Group | Select-Object -ExpandProperty LocalAddress -Unique) -join ","
  Write-Output ("port=" + $_.Name + " name=" + $name + " addrs=" + $addrs)
}

Write-Output "=== Remote access services ==="
try {
  $rdp = Get-ItemProperty "HKLM:\System\CurrentControlSet\Control\Terminal Server" -Name fDenyTSConnections
  Write-Output ("rdp_incoming_denied=" + $rdp.fDenyTSConnections)
} catch {
  Write-Output "rdp_incoming_denied=unknown"
}
try {
  $nla = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name UserAuthentication
  Write-Output ("rdp_nla=" + $nla.UserAuthentication)
} catch {
  Write-Output "rdp_nla=unknown"
}
Get-Service sshd, TermService -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ($_.Name + " status=" + $_.Status + " start=" + $_.StartType)
}
try {
  $guest = Get-LocalUser -Name Guest
  Write-Output ("guest_enabled=" + $guest.Enabled)
} catch {
  Write-Output "guest_enabled=unknown"
}

Write-Output "=== ChartDesk secrets (presence only) ==="
$root = Split-Path -Parent $PSScriptRoot
Write-Output ("env_local_exists=" + (Test-Path (Join-Path $root ".env.local")))
Write-Output ("local_auth_token_exists=" + (Test-Path (Join-Path $root "data\local-auth.token")))
Push-Location $root
Write-Output ("env_local_gitignored=" + [bool](git check-ignore .env.local 2>$null))
Pop-Location
Write-Output "=== done ==="
