# Download better-sqlite3 v12.8.0 prebuilt for Node 24 (ABI 137, win32-x64)
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$root = 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'
Set-Location $root

$version = '12.8.0'
$abi = '137'
$url = "https://github.com/WiseLibs/better-sqlite3/releases/download/v$version/better-sqlite3-v$version-node-v$abi-win32-x64.tar.gz"
$tarPath = "$env:TEMP\better-sqlite3-v12.tar.gz"
$extractDir = "$env:TEMP\better-sqlite3-v12-prebuilt"

Write-Host "Node ABI: $abi"
Write-Host "Downloading: $url"

try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadFile($url, $tarPath)
  Write-Host "Downloaded: $(((Get-Item $tarPath).Length / 1KB).ToString('F0')) KB"
} catch {
  Write-Host "ERROR: Download failed: $_"
  exit 1
}

# Extract
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
New-Item -ItemType Directory -Path $extractDir | Out-Null
C:\Windows\System32\tar.exe -xzf $tarPath -C $extractDir
Write-Host "Extracted to: $extractDir"

# Find the .node binary
$binary = Get-ChildItem -Recurse $extractDir -Filter "*.node" | Select-Object -First 1
if (-not $binary) {
  Write-Host "ERROR: no .node binary in archive"
  Get-ChildItem -Recurse $extractDir | ForEach-Object { Write-Host "  $($_.FullName)" }
  exit 1
}
Write-Host "Found binary: $($binary.Name)"

# Now upgrade better-sqlite3 package files (--ignore-scripts to skip build)
Write-Host ""
Write-Host "=== Installing better-sqlite3@12.8.0 (no build scripts) ==="
npm install better-sqlite3@12.8.0 --ignore-scripts
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed"; exit 1 }

# Place the prebuilt binary
$dest = Join-Path $root 'node_modules\better-sqlite3\build\Release'
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item $binary.FullName -Destination (Join-Path $dest 'better_sqlite3.node') -Force
Write-Host "Binary placed at: $dest\better_sqlite3.node"

# Smoke test
Write-Host ""
Write-Host "=== Smoke test ==="
node -e "const Database = require('./node_modules/better-sqlite3'); const db = new Database(':memory:'); db.exec('CREATE TABLE t (x)'); console.log('better-sqlite3 v12 OK');"
Write-Host "Test exit: $LASTEXITCODE"
