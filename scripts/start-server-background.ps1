$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$nodePath = (Get-Command node).Source
$supervisorPath = Join-Path $repoRoot "scripts\server-supervisor.mjs"

$proc = Start-Process `
  -FilePath $nodePath `
  -ArgumentList $supervisorPath `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started Marketing Helper AI supervisor PID $($proc.Id)."
