# Manually download the better-sqlite3 prebuilt binary for Node 24 (NAPI v10)
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$root = 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'
Set-Location $root

$version = '11.10.0'
$napi = '10'
$url = "https://github.com/WiseLibs/better-sqlite3/releases/download/v$version/better-sqlite3-v$version-napi-v$napi-win32-x64.tar.gz"
$tarPath = "$env:TEMP\better-sqlite3.tar.gz"
$extractDir = "$env:TEMP\better-sqlite3-prebuilt"

Write-Host "Downloading: $url"

# Download with long timeout (5 minutes)
try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadFile($url, $tarPath)
  Write-Host "Download complete: $tarPath ($(((Get-Item $tarPath).Length / 1KB).ToString('F0')) KB)"
} catch {
  Write-Host "Download failed: $_"
  exit 1
}

# Extract using tar (available on Windows 10 1803+)
Write-Host "Extracting..."
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
New-Item -ItemType Directory -Path $extractDir | Out-Null
tar -xzf $tarPath -C $extractDir
Write-Host "Extracted to: $extractDir"

# Copy the .node binary to the build/Release directory
$binary = Get-ChildItem -Recurse $extractDir -Filter "*.node" | Select-Object -First 1
if (-not $binary) {
  Write-Host "ERROR: No .node binary found in archive"
  Get-ChildItem -Recurse $extractDir | Select-Object FullName
  exit 1
}

Write-Host "Found binary: $($binary.FullName)"
$dest = Join-Path $root 'node_modules\better-sqlite3\build\Release'
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item $binary.FullName -Destination (Join-Path $dest 'better_sqlite3.node') -Force
Write-Host "Copied to: $(Join-Path $dest 'better_sqlite3.node')"

# Verify it loads
Write-Host ""
Write-Host "=== Testing better-sqlite3 ==="
node -e "const db = require('./node_modules/better-sqlite3'); console.log('OK - better-sqlite3 loaded, version:', require('./node_modules/better-sqlite3/package.json').version)"
Write-Host "Test exit: $LASTEXITCODE"
