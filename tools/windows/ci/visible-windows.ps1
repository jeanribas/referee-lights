# Janelas VISÍVEIS de todos os descendentes de um processo (o próprio
# processo fica de fora: os avisos do lançador são esperados). Serve para
# provar que o node, o conhost e o PowerShell do Key Relay não abrem janela.
# Saída: JSON [{pid, name, title}] (vazio = nenhuma janela).
param([Parameter(Mandatory = $true)][int]$RootPid)
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class RlWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static List<string> Visible() {
    var r = new List<string>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h)) {
        uint pid; GetWindowThreadProcessId(h, out pid);
        var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
        r.Add(pid + "|" + sb.ToString());
      }
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@

$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
$desc = @{}
$frontier = @($RootPid)
while ($frontier.Count -gt 0) {
  $next = @()
  foreach ($p in $all) {
    if ($frontier -contains [int]$p.ParentProcessId -and -not $desc.ContainsKey([int]$p.ProcessId) -and [int]$p.ProcessId -ne $RootPid) {
      $desc[[int]$p.ProcessId] = $p.Name
      $next += [int]$p.ProcessId
    }
  }
  $frontier = $next
}

$out = @()
foreach ($w in [RlWin]::Visible()) {
  $parts = $w -split '\|', 2
  $wpid = [int]$parts[0]
  if ($desc.ContainsKey($wpid)) {
    $out += [pscustomobject]@{ pid = $wpid; name = $desc[$wpid]; title = $parts[1] }
  }
}
ConvertTo-Json -InputObject @($out) -Compress
