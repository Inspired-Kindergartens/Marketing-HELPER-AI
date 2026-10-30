# Restores a "Back up data" backup (landing footer / npm run backup) onto this machine:
#   1. asks for the backup passphrase and decrypts the .mhbak file
#   2. copies the credential/data files back into the project folder
#   3. creates the Postgres login + database named in the restored .env if missing
#   4. loads database.dump into it with pg_restore (replacing existing tables)
#   5. encrypts the credentials in .env so they only work on this computer
#
# Usage (from the project folder, after `npm install`, with the server stopped):
#   powershell -ExecutionPolicy Bypass -File scripts\restore-backup.ps1 -Backup C:\path\marketing-helper-backup-YYYYMMDD-HHMM.mhbak
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

if (-not (Test-Path (Join-Path $repoRoot "node_modules\.bin\tsx.cmd"))) {
  throw "Run 'npm install' in the project folder first."
}

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("mh-restore-" + [guid]::NewGuid())
$zip = $Backup

if ($Backup -like "*.mhbak") {
  $secure = Read-Host "Backup passphrase" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $zip = Join-Path ([System.IO.Path]::GetTempPath()) ("mh-restore-" + [guid]::NewGuid() + ".zip")
  try {
    # Passed to the decryptor through its environment only, never the command line.
    $env:MH_BACKUP_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    Write-Host "Decrypting $Backup ..."
    & (Join-Path $repoRoot "node_modules\.bin\tsx.cmd") (Join-Path $repoRoot "scripts\backup-decrypt.ts") $Backup $zip
    if ($LASTEXITCODE -ne 0) { throw "Could not decrypt the backup (see message above)." }
  } finally {
    Remove-Item Env:\MH_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Write-Host "Extracting ..."
Expand-Archive -Path $zip -DestinationPath $staging

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

  # 4. The restored .env holds credentials in plain text; seal them to this
  #    computer straight away.
  Write-Host "Encrypting credentials in .env for this computer ..."
  Push-Location $repoRoot
  try {
    & (Join-Path $repoRoot "node_modules\.bin\tsx.cmd") (Join-Path $repoRoot "scripts\seal-secrets.ts")
    if ($LASTEXITCODE -ne 0) { throw "Encrypting .env failed - run 'npm run secrets:seal' before starting the app." }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "Restore complete. Next: npm run build; npm run ai:setup; npm run transfer:check; then start the app with scripts\open-marketing-helper.ps1"
} finally {
  Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
  if ($zip -ne $Backup) { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
}
