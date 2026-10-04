# Derruba o node do RefereeLights.exe (o lançador precisa reerguer sozinho).
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -like '*RefereeLights\runtime\*' }
if (-not $p) { throw 'node do RefereeLights não encontrado' }
$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "node(s) derrubado(s): $(@($p).ProcessId -join ', ')"
