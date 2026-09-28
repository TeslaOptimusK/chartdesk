# Hides the console this PowerShell shares with its parent cmd.
# Used by start-chartdesk.bat so a double-click does not leave a prompt open.
Add-Type -Name ChartDeskConsole -Namespace ChartDesk -MemberDefinition @"
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
"@
$hwnd = [ChartDesk.ChartDeskConsole]::GetConsoleWindow()
if ($hwnd -ne [IntPtr]::Zero) {
  [void][ChartDesk.ChartDeskConsole]::ShowWindow($hwnd, 0)
}
