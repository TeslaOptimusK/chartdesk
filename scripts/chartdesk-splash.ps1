param([switch]$Close)

$pidFile = Join-Path $env:TEMP "chartdesk-splash.pid"

function Stop-PidFileSplash {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $idText = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $id = 0
  if ([int]::TryParse([string]$idText, [ref]$id) -and $id -gt 0 -and $id -ne $PID) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

function Stop-LeftoverSplashes {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -like "*chartdesk-splash.ps1*" -and
      $_.CommandLine -notlike "* -Close*"
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='mshta.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*chartdesk-splash.hta*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

Stop-PidFileSplash
if ($Close) {
  Stop-LeftoverSplashes
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  exit 0
}

$PID | Set-Content -LiteralPath $pidFile -Encoding ascii

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Korean copy is built from code points so the file stays ASCII.
$status = ""
foreach ($cp in @(0xCC28, 0xD2B8, 0xB97C, 0x20, 0xC900, 0xBE44, 0xD558, 0xACE0, 0x20, 0xC788, 0xC2B5, 0xB2C8, 0xB2E4)) {
  $status += [char]$cp
}

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.ClientSize = New-Object System.Drawing.Size(460, 260)
$form.BackColor = [System.Drawing.Color]::FromArgb(255, 11, 18, 32)
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.ControlBox = $false
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.Text = ""
$prop = $form.GetType().GetProperty("DoubleBuffered", [System.Reflection.BindingFlags]"Instance,NonPublic")
if ($prop) { $prop.SetValue($form, $true, $null) }

$radius = 18
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = $radius * 2
$w = $form.ClientSize.Width
$h = $form.ClientSize.Height
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($w - $d, 0, $d, $d, 270, 90)
$path.AddArc($w - $d, $h - $d, $d, $d, 0, 90)
$path.AddArc(0, $h - $d, $d, $d, 90, 90)
$path.CloseFigure()
$form.Region = New-Object System.Drawing.Region($path)

$script:slide = -70
$form.Add_Paint({
  param($sender, $e)
  $g = $e.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 18, 32))

  $mark = New-Object System.Drawing.Drawing2D.GraphicsPath
  $mark.AddArc(202, 48, 28, 28, 180, 90)
  $mark.AddArc(230, 48, 28, 28, 270, 90)
  $mark.AddArc(230, 76, 28, 28, 0, 90)
  $mark.AddArc(202, 76, 28, 28, 90, 90)
  $mark.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 83, 45))), $mark)

  $titleFont = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font("Malgun Gothic", 11)
  $cFont = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
  $title = "ChartDesk"
  $titleSize = $g.MeasureString($title, $titleFont)
  $g.DrawString("C", $cFont, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 134, 239, 172))), 214, 58)
  $g.DrawString($title, $titleFont, [System.Drawing.Brushes]::WhiteSmoke, (460 - $titleSize.Width) / 2, 118)
  $bodySize = $g.MeasureString($status, $bodyFont)
  $g.DrawString($status, $bodyFont, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))), (460 - $bodySize.Width) / 2, 158)

  $track = New-Object System.Drawing.Rectangle(140, 198, 180, 3)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 41, 59))), $track)
  $bar = New-Object System.Drawing.Rectangle([int]$script:slide, 198, 70, 3)
  $g.SetClip($track)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))), $bar)
  $g.ResetClip()
})

$script:swept = $false
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 16
$timer.Add_Tick({
  if (-not $script:swept) {
    $script:swept = $true
    Stop-LeftoverSplashes
  }
  $script:slide += 4
  if ($script:slide -gt 320) { $script:slide = -70 }
  $form.Invalidate()
})
$timer.Start()

[System.Windows.Forms.Application]::EnableVisualStyles()
[void]$form.ShowDialog()
$timer.Stop()
if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
