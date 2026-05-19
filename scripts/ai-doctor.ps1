$ErrorActionPreference = "Stop"

$Model = if ($env:AI_CHAT_MODEL) { $env:AI_CHAT_MODEL } else { "llama3.1:8b" }
$BaseUrl = if ($env:AI_BASE_URL) { $env:AI_BASE_URL.TrimEnd("/") } else { "http://127.0.0.1:11434" }

function Find-Ollama {
  $command = Get-Command ollama -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  $candidate = Join-Path $localAppData "Programs\Ollama\ollama.exe"

  if (Test-Path $candidate) {
    return $candidate
  }

  $repoCandidate = Join-Path (Get-Location) ".local\ollama\ollama.exe"

  if (Test-Path $repoCandidate) {
    return $repoCandidate
  }

  return $null
}

$ollamaPath = Find-Ollama
$apiOk = $false
$modelInstalled = $false
$tagsError = $null

try {
  $tags = Invoke-RestMethod -Uri "$BaseUrl/api/tags" -Method Get -TimeoutSec 5
  $apiOk = $true
  $modelInstalled = @($tags.models).name -contains $Model
} catch {
  $tagsError = $_.Exception.Message
}

[pscustomobject]@{
  OllamaInstalled = [bool]$ollamaPath
  OllamaPath = $ollamaPath
  ApiBaseUrl = $BaseUrl
  ApiReachable = $apiOk
  Model = $Model
  ModelInstalled = $modelInstalled
  Error = $tagsError
} | ConvertTo-Json -Compress
