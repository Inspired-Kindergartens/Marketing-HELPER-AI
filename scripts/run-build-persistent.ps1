param(
  [int]$RestartDelaySeconds = 3,
  [int]$MaxRestarts = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$restartCount = 0

while ($true) {
  # Rebuild on every (re)start so a relaunch always serves fresh `dist`.
  # The shortcut restarts the server by killing port 3000; this loop then
  # respawns, and rebuilding here is what makes that respawn pick up the
  # latest source. (Previously the build ran once before the loop, so a
  # restart re-served the stale compiled output.)
  Write-Host "Building Marketing Helper AI..."
  npm.cmd run build
  $buildExit = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }
  if ($buildExit -ne 0) {
    Write-Warning "Build failed with code $buildExit; retrying in $RestartDelaySeconds second(s)."
    Start-Sleep -Seconds $RestartDelaySeconds
    continue
  }

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
