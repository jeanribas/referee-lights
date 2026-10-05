# Janela do painel (WebView2) do RefereeLights.exe, para os testes:
#   -Action state       -> JSON {found, visible, title, dialog}
#   -Action close       -> manda WM_CLOSE (o X)
#   -Action answer-no   -> clica "Não" na pergunta de encerrar
#   -Action answer-yes  -> clica "Sim"
param(
  [Parameter(Mandatory = $true)][int]$LauncherPid,
  [Parameter(Mandatory = $true)][ValidateSet('state', 'close', 'answer-no', 'answer-yes')][string]$Action
)
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class RlPanel {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string Title(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  public static IntPtr Find(uint pid, string cls) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && Cls(h) == cls) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$panel = [RlPanel]::Find([uint32]$LauncherPid, 'webview')
$dialog = [RlPanel]::Find([uint32]$LauncherPid, '#32770')
switch ($Action) {
  'state' {
    [pscustomobject]@{
      found   = ($panel -ne [IntPtr]::Zero)
      visible = ($panel -ne [IntPtr]::Zero -and [RlPanel]::IsWindowVisible($panel))
      title   = if ($panel -ne [IntPtr]::Zero) { [RlPanel]::Title($panel) } else { '' }
      dialog  = ($dialog -ne [IntPtr]::Zero -and [RlPanel]::IsWindowVisible($dialog))
    } | ConvertTo-Json -Compress
  }
  'close' { if ($panel -eq [IntPtr]::Zero) { throw 'janela do painel não encontrada' }; [void][RlPanel]::PostMessage($panel, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
  'answer-no' { if ($dialog -eq [IntPtr]::Zero) { throw 'pergunta não encontrada' }; [void][RlPanel]::PostMessage($dialog, 0x0111, [IntPtr]7, [IntPtr]::Zero) }
  'answer-yes' { if ($dialog -eq [IntPtr]::Zero) { throw 'pergunta não encontrada' }; [void][RlPanel]::PostMessage($dialog, 0x0111, [IntPtr]6, [IntPtr]::Zero) }
}
