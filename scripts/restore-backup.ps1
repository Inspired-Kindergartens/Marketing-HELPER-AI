# Restores a "Back up data" zip (landing footer) onto this machine:
#   1. copies the credential/data files back into the project folder
#   2. creates the Postgres login + database named in the restored .env if missing
#   3. loads database.dump into it with pg_restore (replacing existing tables)
#
# Usage (from the project folder, with the server stopped):
#   powershell -ExecutionPolicy Bypass -File scripts\restore-backup.ps1 -Backup C:\path\marketing-helper-backup-YYYYMMDD-HHMM.zip
param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [string]$PostgresSuperuser = "postgres"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Find-PgTool([string]$name) {
  if ($env:PG_BIN) { return Join-Path $env:PG_BIN "$name.exe" }
  $root = "C:\Program Files\PostgreSQL"
  if (Test-Path $root) {
    $versions = Get-ChildItem $root -Directory | Sort-Object { [int]$_.Name } -Descending
    foreach ($v in $versions) {
      $candidate = Join-Path $v.FullName "bin\$name.exe"
      if (Test-Path $candidate) { return $candidate }
    }
  }
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "$name not found. Install PostgreSQL (https://www.postgresql.org/download/windows/) or set PG_BIN to its bin folder."
}

$psql = Find-PgTool "psql"
$pgRestore = Find-PgTool "pg_restore"

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("mh-restore-" + [guid]::NewGuid())
Write-Host "Extracting $Backup ..."
Expand-Archive -Path $Backup -DestinationPath $staging

try {
  $dump = Join-Path $staging "database.dump"
  if (-not (Test-Path $dump)) { throw "database.dump missing - is this a Marketing Helper backup?" }

  # 1. Files. Keep a copy of any .env being replaced.
  $existingEnv = Join-Path $repoRoot ".env"
  if (Test-Path $existingEnv) {
    Copy-Item $existingEnv (Join-Path $repoRoot ".env.before-restore") -Force
    Write-Host "Existing .env saved as .env.before-restore"
  }
  $files = Join-Path $staging "files"
  if (Test-Path $files) {
    Get-ChildItem $files -Force | ForEach-Object {
      Copy-Item $_.FullName (Join-Path $repoRoot $_.Name) -Recurse -Force
      Write-Host "Restored $($_.Name)"
    }
  }

  # 2. Database login + database from the restored .env.
  $line = Get-Content $existingEnv | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) { throw "DATABASE_URL not found in .env" }
  $url = ($line -replace '^DATABASE_URL=', '').Trim('"', "'")
  $url = $url -replace '\?.*$', ''
  if ($url -notmatch '^postgres(?:ql)?://([^:]+):([^@]*)@([^:/]+):?(\d*)/(.+)$') { throw "Could not parse DATABASE_URL" }
  $dbUser = [uri]::UnescapeDataString($Matches[1])
  $dbPass = [uri]::UnescapeDataString($Matches[2])
  $dbHost = $Matches[3]
  $dbPort = if ($Matches[4]) { $Matches[4] } else { "5432" }
  $dbName = $Matches[5]

  Write-Host "Ensuring role '$dbUser' and database '$dbName' exist (you may be asked for the '$PostgresSuperuser' password) ..."
  $escapedPass = $dbPass -replace "'", "''"
  $sql = @"
DO `$`$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$dbUser') THEN
    CREATE ROLE "$dbUser" LOGIN PASSWORD '$escapedPass';
  END IF;
END`$`$;
"@
  & $psql -h $dbHost -p $dbPort -U $PostgresSuperuser -d postgres -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw "Creating role failed" }
  $exists = & $psql -h $dbHost -p $dbPort -U $PostgresSuperuser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
  if ($exists -ne "1") {
    & $psql -h $dbHost -p $dbPort -U $PostgresSuperuser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$dbName`" OWNER `"$dbUser`""
    if ($LASTEXITCODE -ne 0) { throw "Creating database failed" }
  }

  # 3. Load the data as the app's own login so it owns every table.
  Write-Host "Restoring database (this replaces any existing tables) ..."
  & $pgRestore --clean --if-exists --no-owner --no-privileges --dbname $url $dump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore reported errors (see above)" }

  Write-Host ""
  Write-Host "Restore complete. Next: npm install; npm run build; then start the app with scripts\open-marketing-helper.ps1"
} finally {
  Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
}
