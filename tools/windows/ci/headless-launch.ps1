# Sobe o pacote EXATAMENTE como o Iniciar.cmd, menos as partes interativas.
# Gera uma cópia do Iniciar.cmd sem o "pause" final, sem o taskkill que vem
# depois dele e sem abrir o navegador — o resto (cd /d "%~dp0", PATH com o
# node embutido, start /min ... cmd /k, detecção de IP) roda igual.
# Uso: pwsh headless-launch.ps1 -BundleDir "C:\...\Referee Lights"
param([Parameter(Mandatory = $true)][string]$BundleDir)
$ErrorActionPreference = 'Stop'

$src = Join-Path $BundleDir 'Iniciar.cmd'
$dst = Join-Path $BundleDir 'Iniciar-ci.cmd'
$lines = Get-Content -LiteralPath $src -Encoding UTF8
$out = foreach ($l in $lines) {
  if ($l -match '^\s*pause\s*>nul') { 'exit /b 0'; break }   # para antes do encerramento
  if ($l -match '^\s*start\s+""\s+"http') { continue }          # sem navegador
  $l
}
# Mesmo encoding do original (UTF-8 sem BOM), para o chcp 65001 se comportar igual
[System.IO.File]::WriteAllLines($dst, $out, (New-Object System.Text.UTF8Encoding($false)))

$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$dst`"" -WorkingDirectory $BundleDir -PassThru -Wait -NoNewWindow
if ($p.ExitCode -ne 0) { throw "Iniciar-ci.cmd saiu com código $($p.ExitCode)" }

function Wait-Url([string]$url, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 0 -ErrorAction Stop
      return $r.StatusCode
    } catch {
      $code = $_.Exception.Response.StatusCode.value__
      if ($code -ge 200 -and $code -lt 400) { return $code }
      Start-Sleep -Seconds 1
    }
  }
  throw "Timeout esperando $url"
}

Write-Host "server  /health  -> $(Wait-Url 'http://127.0.0.1:3333/health' 60)"
Write-Host "frontend /admin  -> $(Wait-Url 'http://127.0.0.1:3000/admin' 60)"
