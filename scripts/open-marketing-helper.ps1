$ErrorActionPreference = "Stop"

$taskName = "Marketing Helper AI Server"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$url = "http://127.0.0.1:3000/"
$healthUrl = "http://127.0.0.1:3000/health"
$ollamaUrl = "http://127.0.0.1:11434"
$timeoutSeconds = 45

Set-Location $repoRoot

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

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-OllamaReady) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

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

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ServerReady) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

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

$aiProvider = Read-DotEnvValue -Name "AI_PROVIDER" -DefaultValue "builtin"
if ($aiProvider -eq "ollama") {
  Start-OllamaServer
}

if (-not (Test-ServerReady)) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $started = $false

  if ($task) {
    try {
      Start-ScheduledTask -TaskName $taskName
      $started = $true
    } catch {
      $started = $false
    }
  }

  if ($started) {
    $started = Wait-ServerReady -Seconds 15
  }

  if (-not $started) {
    Start-PersistentRunner
    Wait-ServerReady -Seconds $timeoutSeconds | Out-Null
  }
}

Start-Process $url
