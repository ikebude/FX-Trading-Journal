# Step 1: Install all packages, skip native build scripts
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
Set-Location 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'

Write-Host "=== Step 1: npm install --ignore-scripts ==="
npm install --ignore-scripts
Write-Host "ignore-scripts exit: $LASTEXITCODE"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Step 2: Load MSVC env so cl.exe / link.exe are on PATH
Write-Host ""
Write-Host "=== Step 2: Loading MSVC environment ==="
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$envLines = cmd /c "`"$vcvars`" && set" 2>&1
foreach ($line in $envLines) {
  if ($line -match '^([A-Za-z_][^=]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}
$cl = (Get-Command cl.exe -ErrorAction SilentlyContinue)
Write-Host "cl.exe: $(if ($cl) { $cl.Source } else { 'NOT FOUND - aborting' })"
if (-not $cl) { exit 1 }

# Step 3: Rebuild better-sqlite3 natively
# node-gyp --msvs_version flag overrides the version-detection logic
Write-Host ""
Write-Host "=== Step 3: Rebuilding better-sqlite3 ==="
$nodegyp = ".\node_modules\.bin\node-gyp.cmd"
Push-Location ".\node_modules\better-sqlite3"
& $nodegyp rebuild --release --msvs_version=2022
$bsqliteExit = $LASTEXITCODE
Pop-Location
Write-Host "better-sqlite3 build exit: $bsqliteExit"
if ($bsqliteExit -ne 0) {
  Write-Host "ERROR: better-sqlite3 failed to build"
  exit $bsqliteExit
}

# Step 4: Rebuild sharp (image processing — also native)
Write-Host ""
Write-Host "=== Step 4: Rebuilding sharp ==="
$env:SHARP_IGNORE_GLOBAL_LIBVIPS = '1'
Push-Location ".\node_modules\sharp"
# sharp uses its own install script that downloads prebuilds
& node install/check 2>&1
$sharpExit = $LASTEXITCODE
if ($sharpExit -ne 0) {
  Write-Host "sharp prebuild check failed, trying node-gyp..."
  & $nodegyp rebuild --release --msvs_version=2022
  $sharpExit = $LASTEXITCODE
}
Pop-Location
Write-Host "sharp build exit: $sharpExit"

Write-Host ""
Write-Host "=== All done. Exit codes: better-sqlite3=$bsqliteExit sharp=$sharpExit ==="
if ($bsqliteExit -eq 0) {
  Write-Host "SUCCESS: native modules built. Run npm test next."
}
