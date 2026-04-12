# Download Electron 34.5.8 win32-x64 binary directly
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$root = 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'
$version = '34.5.8'
$url = "https://github.com/electron/electron/releases/download/v$version/electron-v$version-win32-x64.zip"
$zipPath = "$env:TEMP\electron-v$version.zip"
$extractDir = Join-Path $root "node_modules\electron\dist"

Write-Host "Downloading Electron $version..."
Write-Host "URL: $url"

try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadFile($url, $zipPath)
  Write-Host "Downloaded: $(((Get-Item $zipPath).Length / 1MB).ToString('F1')) MB"
} catch {
  Write-Host "ERROR: $_"
  exit 1
}

Write-Host "Extracting to: $extractDir"
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
Write-Host "Extracted."

# Write path.txt so electron/index.js knows where the binary is
$pathTxt = Join-Path $root "node_modules\electron\path.txt"
Set-Content -Path $pathTxt -Value "dist\electron.exe" -NoNewline
Write-Host "path.txt written: dist\electron.exe"

# Verify
$binary = Join-Path $extractDir "electron.exe"
if (Test-Path $binary) {
  Write-Host "SUCCESS: $binary"
} else {
  Write-Host "ERROR: electron.exe not found in $extractDir"
  Get-ChildItem $extractDir | Select-Object Name
  exit 1
}
