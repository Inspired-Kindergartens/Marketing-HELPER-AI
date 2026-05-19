param(
  [int]$RestartDelaySeconds = 3,
  [int]$MaxRestarts = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Building Marketing Helper AI..."
npm.cmd run build

$restartCount = 0

while ($true) {
  $startedAt = Get-Date
  Write-Host "Starting compiled server at $($startedAt.ToString("s"))..."

  npm.cmd run start
  $exitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }

  if ($exitCode -eq 0) {
    Write-Host "Server exited cleanly."
    exit 0
  }

  $restartCount += 1
  Write-Warning "Server exited with code $exitCode."

  if ($MaxRestarts -gt 0 -and $restartCount -ge $MaxRestarts) {
    Write-Error "Server failed $restartCount time(s); not restarting."
    exit $exitCode
  }

  Write-Host "Restarting in $RestartDelaySeconds second(s). Press Ctrl+C to stop."
  Start-Sleep -Seconds $RestartDelaySeconds
}
