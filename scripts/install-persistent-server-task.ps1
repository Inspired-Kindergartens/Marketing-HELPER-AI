$ErrorActionPreference = "Stop"

$taskName = "Marketing Helper AI Server"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runnerPath = Join-Path $repoRoot "scripts\run-build-persistent.cmd"
$cmdPath = Join-Path $env:SystemRoot "System32\cmd.exe"

$action = New-ScheduledTaskAction `
  -Execute $cmdPath `
  -Argument "/c `"$runnerPath`"" `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host "Installed and started scheduled task '$taskName'."
