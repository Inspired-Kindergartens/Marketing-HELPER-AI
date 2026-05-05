param(
  [Parameter(Mandatory = $true)]
  [string]$Command,

  [string]$BlacklistPath = ""
)

if (-not $BlacklistPath) {
  $BlacklistPath = Join-Path $PSScriptRoot "command-blacklist.json"
}

try {
  $blacklist = Get-Content -Raw -LiteralPath $BlacklistPath -ErrorAction Stop | ConvertFrom-Json
} catch {
  Write-Error "Unable to read command blacklist at '$BlacklistPath'. Refusing to execute."
  exit 65
}

foreach ($entry in $blacklist.blockedSubstrings) {
  if ($Command.Contains([string]$entry.pattern)) {
    Write-Error "Blocked command pattern: '$($entry.pattern)'. $($entry.reason)"
    exit 64
  }
}

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $Command
exit $LASTEXITCODE
