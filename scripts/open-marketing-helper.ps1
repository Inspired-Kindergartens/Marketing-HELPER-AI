$ErrorActionPreference = "Stop"

$taskName = "Marketing Helper AI Server"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$url = "http://127.0.0.1:3000/"
$healthUrl = "http://127.0.0.1:3000/health"
$ollamaUrl = "http://127.0.0.1:11434"
$timeoutSeconds = 45

Set-Location $repoRoot

Write-Host "Marketing Helper AI"
Write-Host "--------------------"

function Read-DotEnvValue {
  param(
    [string]$Name,
    [string]$DefaultValue
  )

  $envPath = Join-Path $repoRoot ".env"
  if (-not (Test-Path $envPath)) {
    return $DefaultValue
  }

  $line = Get-Content $envPath |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $DefaultValue
  }

  return (($line -replace "^\s*$([regex]::Escape($Name))\s*=\s*", "").Trim('"').Trim("'"))
}

function Test-ServerReady {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-OllamaReady {
  try {
    $baseUrl = (Read-DotEnvValue -Name "AI_BASE_URL" -DefaultValue $ollamaUrl).TrimEnd("/")
    $response = Invoke-WebRequest -Uri "$baseUrl/api/tags" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-OllamaReady {
  param([int]$Seconds)

  Write-Host -NoNewline "Starting Ollama"
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-OllamaReady) {
      Write-Host " ready!"
      return $true
    }

    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
  }

  Write-Host " timed out."
  return $false
}

function Find-Ollama {
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $localPath = Join-Path $repoRoot ".local\ollama\ollama.exe"
  if (Test-Path $localPath) {
    return $localPath
  }

  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  $installedPath = Join-Path $localAppData "Programs\Ollama\ollama.exe"
  if (Test-Path $installedPath) {
    return $installedPath
  }

  return $null
}

function Start-OllamaServer {
  if (Test-OllamaReady) {
    return
  }

  $ollamaPath = Find-Ollama
  if (-not $ollamaPath) {
    return
  }

  Start-Process `
    -FilePath $ollamaPath `
    -ArgumentList "serve" `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden | Out-Null

  Wait-OllamaReady -Seconds 20 | Out-Null
}

function Wait-ServerReady {
  param([int]$Seconds)

  Write-Host -NoNewline "Starting Marketing Helper AI"
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ServerReady) {
      Write-Host " ready!"
      return $true
    }

    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
  }

  Write-Host " timed out."
  return $false
}

function Start-PersistentRunner {
  $runnerPath = Join-Path $repoRoot "scripts\run-build-persistent.cmd"
  Start-Process `
    -FilePath (Join-Path $env:SystemRoot "System32\cmd.exe") `
    -ArgumentList "/c `"$runnerPath`"" `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden | Out-Null
}

# Kills whatever currently serves port 3000 so a relaunch picks up fresh code.
# The supervisor (`run-build-persistent.ps1`) rebuilds at the top of every loop
# iteration, so force-killing its server child makes `npm run start` exit
# non-zero -> the loop respawns AND rebuilds. Returns $true if a supervisor was
# already running (and is therefore expected to respawn on its own).
function Stop-RunningServer {
  $hadListener = $false

  try {
    $conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    foreach ($ownerPid in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
      $hadListener = $true
      Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # Some locked-down Windows shells deny Get-NetTCPConnection. Fall back to
    # netstat/taskkill so the desktop shortcut still forces a fresh rebuild.
    $lines = netstat -ano | Select-String '127\.0\.0\.1:3000\s+.*LISTENING'
    foreach ($line in $lines) {
      $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
      if ($parts.Count -eq 0) {
        continue
      }

      $ownerPid = 0
      if ([int]::TryParse($parts[-1], [ref]$ownerPid) -and $ownerPid -gt 0) {
        $hadListener = $true
        taskkill.exe /PID $ownerPid /F | Out-Null
      }
    }
  }

  # Wait for the port to actually free up before we decide whether to spawn a
  # new supervisor (avoids racing a respawn into a double-launch).
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-ServerReady)) { break }
    Start-Sleep -Milliseconds 250
  }

  return $hadListener
}

# Brings the marketing-helper server up, ALWAYS rebuilding first so a relaunch
# from the shortcut ships the latest code (previously it no-oped when the server
# was already healthy, which served stale `dist`). The scheduled task is the
# primary server-runtime dependency: a supervised, logon-triggered job whose
# runner (`run-build-persistent.ps1`) rebuilds then serves on every loop pass.
# Any future server-runtime dependency (cron jobs, background workers,
# additional scheduled tasks) should be started from this script too.
function Start-MarketingHelperServer {
  # Tear down the current server so the relaunch rebuilds and serves fresh code.
  $supervisorWasRunning = Stop-RunningServer

  # If a supervisor was already alive, killing its server child makes its loop
  # rebuild and respawn on its own. Give it a chance before spawning another.
  if ($supervisorWasRunning) {
    if (Wait-ServerReady -Seconds $timeoutSeconds) {
      return
    }
  }

  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $started = $false

  if ($task) {
    # Self-heal: if the task was left disabled, re-enable it so the shortcut
    # keeps working without manual intervention.
    if ($task.State -eq "Disabled") {
      try {
        Enable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null
      } catch {
        # If we can't enable it (e.g. permissions), fall through to the runner.
      }
    }

    try {
      Start-ScheduledTask -TaskName $taskName
      $started = $true
    } catch {
      $started = $false
    }
  }

  if ($started) {
    # The runner rebuilds before serving, so allow extra time for `tsc`.
    $started = Wait-ServerReady -Seconds $timeoutSeconds
  }

  if (-not $started) {
    Start-PersistentRunner
    Wait-ServerReady -Seconds $timeoutSeconds | Out-Null
  }
}

$aiProvider = Read-DotEnvValue -Name "AI_PROVIDER" -DefaultValue "builtin"
if ($aiProvider -eq "ollama") {
  Start-OllamaServer
}

Start-MarketingHelperServer

Start-Process $url
