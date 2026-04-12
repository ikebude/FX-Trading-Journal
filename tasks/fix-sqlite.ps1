# Upgrade better-sqlite3 to latest (has Node 24 prebuilt binaries)
# and re-run install so prebuild-install downloads the binary instead of compiling
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
Set-Location 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'

Write-Host "Node version: $(node --version)"
Write-Host "npm version: $(npm --version)"
Write-Host ""

Write-Host "=== Upgrading better-sqlite3 to latest ==="
npm install better-sqlite3@latest
Write-Host "Exit: $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Checking binary ==="
node -e "const db = require('better-sqlite3'); console.log('better-sqlite3 OK:', db.constructor.name)"
Write-Host "Require test exit: $LASTEXITCODE"
