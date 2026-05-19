param(
  [string]$Model = "llama3.1:8b",
  [string]$RuntimeDir = ".local\ollama",
  [string]$ModelsDir = ".local\ollama-models",
  [string]$InstallScriptUrl = "https://ollama.com/install.ps1"
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
  param([string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }

  return Join-Path (Get-Location) $Path
}

function Find-Ollama {
  param([string]$RepoRuntimeDir)

  $repoCandidate = Join-Path $RepoRuntimeDir "ollama.exe"

  if (Test-Path $repoCandidate) {
    return $repoCandidate
  }

  $command = Get-Command ollama -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  $candidate = Join-Path $localAppData "Programs\Ollama\ollama.exe"

  if (Test-Path $candidate) {
    return $candidate
  }

  return $null
}

function Wait-ForOllamaApi {
  param(
    [string]$BaseUrl,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-RestMethod -Uri "$BaseUrl/api/tags" -Method Get -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

function Install-Ollama {
  param([string]$RepoRuntimeDir)

  New-Item -ItemType Directory -Path $RepoRuntimeDir -Force | Out-Null
  $installScript = Join-Path $env:TEMP "ollama-install.ps1"

  Write-Host "Downloading official Ollama installer script..."
  Invoke-WebRequest -Uri $InstallScriptUrl -UseBasicParsing -OutFile $installScript

  Write-Host "Installing Ollama runtime to $RepoRuntimeDir..."
  $previousInstallDir = $env:OLLAMA_INSTALL_DIR
  $previousDebug = $env:OLLAMA_DEBUG

  try {
    $env:OLLAMA_INSTALL_DIR = $RepoRuntimeDir
    $env:OLLAMA_DEBUG = "1"
    powershell -ExecutionPolicy Bypass -File $installScript
  } finally {
    $env:OLLAMA_INSTALL_DIR = $previousInstallDir
    $env:OLLAMA_DEBUG = $previousDebug
  }
}

$runtimePath = Resolve-RepoPath $RuntimeDir
$modelsPath = Resolve-RepoPath $ModelsDir
$baseUrl = if ($env:AI_BASE_URL) { $env:AI_BASE_URL.TrimEnd("/") } else { "http://127.0.0.1:11434" }
$ollamaPath = Find-Ollama -RepoRuntimeDir $runtimePath

if (-not $ollamaPath) {
  Install-Ollama -RepoRuntimeDir $runtimePath
  $ollamaPath = Find-Ollama -RepoRuntimeDir $runtimePath
}

if (-not $ollamaPath) {
  throw "Ollama was not found after installation."
}

New-Item -ItemType Directory -Path $modelsPath -Force | Out-Null
$env:OLLAMA_MODELS = $modelsPath
$env:PATH = "$runtimePath;$env:PATH"

try {
  Invoke-RestMethod -Uri "$baseUrl/api/tags" -Method Get -TimeoutSec 3 | Out-Null
} catch {
  Write-Host "Starting Ollama server..."
  Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden -WorkingDirectory (Get-Location) | Out-Null

  if (-not (Wait-ForOllamaApi -BaseUrl $baseUrl)) {
    throw "Ollama did not become reachable at $baseUrl."
  }
}

Write-Host "Pulling model $Model..."
& $ollamaPath pull $Model

if ($LASTEXITCODE -ne 0) {
  throw "Model pull failed for $Model."
}

[pscustomobject]@{
  OllamaPath = $ollamaPath
  ModelsPath = $modelsPath
  ApiBaseUrl = $baseUrl
  Model = $Model
  Ready = $true
} | ConvertTo-Json -Compress
