' Windowless ChartDesk helper. No console of its own.
'   (no args)     start scripts\start-chartdesk.bat --hidden
'   updated       start the bat at :launch after a git fast-forward
'   shortcut      point Desktop\ChartDesk.lnk at this script
'   server        npm run dev with a hidden console
'   alert "text"  message box

Option Explicit

Dim fso, sh, scriptDir, repo, mode
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repo = fso.GetParentFolderName(scriptDir)

mode = ""
If WScript.Arguments.Count > 0 Then mode = LCase(WScript.Arguments(0))

If mode = "" Or mode = "launch" Then
  OpenSplash
  sh.CurrentDirectory = repo
  sh.Run "cmd /c """ & scriptDir & "\start-chartdesk.bat"" --hidden", 0, False
  WScript.Quit 0
End If

If mode = "updated" Then
  sh.CurrentDirectory = repo
  sh.Run "cmd /c """ & scriptDir & "\start-chartdesk.bat"" --updated", 0, False
  WScript.Quit 0
End If

If mode = "shortcut" Then
  FixShortcut
  WScript.Quit 0
End If

If mode = "server" Then
  StartServer
  WScript.Quit 0
End If

If mode = "splash" Then
  OpenSplash
  WScript.Quit 0
End If

If mode = "splash-close" Then
  CloseSplash
  WScript.Quit 0
End If

If mode = "alert" Then
  CloseSplash
  Dim msg
  msg = "ChartDesk could not start."
  If WScript.Arguments.Count > 1 Then msg = WScript.Arguments(1)
  MsgBox msg, 48, "ChartDesk"
  WScript.Quit 0
End If

WScript.Quit 1

Sub FixShortcut()
  Dim desktop, lnk, sc, iconPath
  desktop = sh.SpecialFolders("Desktop")
  If Len(desktop) = 0 Then Exit Sub
  lnk = desktop & "\ChartDesk.lnk"
  Set sc = sh.CreateShortcut(lnk)
  sc.TargetPath = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
  sc.Arguments = "//nologo """ & scriptDir & "\chartdesk-launch.vbs"""
  sc.WorkingDirectory = repo
  sc.WindowStyle = 7
  sc.Description = "Start ChartDesk (http://127.0.0.1:43127)"
  iconPath = repo & "\public\chartdesk.ico"
  If fso.FileExists(iconPath) Then sc.IconLocation = iconPath & ",0"
  sc.Save
End Sub

Sub OpenSplash()
  Dim hta
  hta = scriptDir & "\chartdesk-splash.hta"
  If Not fso.FileExists(hta) Then Exit Sub
  sh.Run "mshta.exe """ & hta & """", 1, False
End Sub

Sub CloseSplash()
  Dim cmd
  cmd = "powershell -NoProfile -Command " & _
    """Get-CimInstance Win32_Process -Filter 'Name=''mshta.exe''' | " & _
    "Where-Object { $_.CommandLine -like '*chartdesk-splash.hta*' } | " & _
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
  sh.Run cmd, 0, True
End Sub

Sub StartServer()
  Dim logDir, cmd
  sh.CurrentDirectory = repo
  logDir = repo & "\data"
  If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir
  cmd = "cmd /c npm run dev -- -H 127.0.0.1 -p 43127 > """ & logDir & "\chartdesk-server.log"" 2>&1"
  sh.Run cmd, 0, False
End Sub
