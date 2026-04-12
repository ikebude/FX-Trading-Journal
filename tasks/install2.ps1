# Fix: node-gyp can't parse VS version "18" from folder name.
# Set msvs_version=2022 in npm config and GYP_MSVS_OVERRIDE_PATH so
# node-gyp accepts the BuildTools installation.

$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
Set-Location 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'

# Load MSVC environment so cl.exe / link.exe are on PATH
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$envLines = cmd /c "`"$vcvars`" && set" 2>&1
foreach ($line in $envLines) {
  if ($line -match '^([A-Za-z_][^=]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}

# Tell node-gyp which VS year to use (overrides version-string parsing)
$env:GYP_MSVS_VERSION = '2022'
$env:GYP_MSVS_OVERRIDE_PATH = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools'

Write-Host "cl.exe path: $((Get-Command cl.exe -ErrorAction SilentlyContinue).Source)"
Write-Host "GYP_MSVS_VERSION: $env:GYP_MSVS_VERSION"
Write-Host "GYP_MSVS_OVERRIDE_PATH: $env:GYP_MSVS_OVERRIDE_PATH"
Write-Host ""

# Persist msvs_version in npm config for this project
npm config set msvs_version 2022
Write-Host "npm msvs_version: $(npm config get msvs_version)"
Write-Host ""
Write-Host "=== Running npm install ==="
npm install 2>&1
Write-Host "Exit code: $LASTEXITCODE"
