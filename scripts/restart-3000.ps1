$line = netstat -ano | Select-String '127\.0\.0\.1:3000\s+.*LISTENING' | Select-Object -First 1

if ($line) {
  $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
  $listenPid = [int]$parts[-1]
  taskkill.exe /PID $listenPid /F
  Start-Sleep -Seconds 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$proc = Start-Process `
  -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
  -ArgumentList '-Command', "Set-Location '$repoRoot'; npm.cmd run dev *> .codex-devserver.log" `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 8

$html = (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/?window=3M' -UseBasicParsing -TimeoutSec 8).Content

[pscustomobject]@{
  StartedWrapperProcessId = $proc.Id
  HasDashboard = $html -like '*Infocare Analytics*'
  HasWaitlist = $html -like '*Waitlist Quality*'
  HasChartScript = $html -like '*vendor/chart.umd.js*'
} | ConvertTo-Json -Compress
