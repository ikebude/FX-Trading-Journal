# Build native modules after npm install --ignore-scripts
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$root = 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'
Set-Location $root

# Load MSVC environment
Write-Host "=== Loading MSVC env ==="
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$envLines = cmd /c "`"$vcvars`" && set" 2>&1
foreach ($line in $envLines) {
  if ($line -match '^([A-Za-z_][^=]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}
$cl = (Get-Command cl.exe -ErrorAction SilentlyContinue)
Write-Host "cl.exe: $(if ($cl) { $cl.Source } else { 'NOT FOUND' })"
if (-not $cl) { exit 1 }

# Absolute path to node-gyp so it works from any working directory
$nodeGyp = Join-Path $root 'node_modules\.bin\node-gyp.cmd'
Write-Host "node-gyp: $nodeGyp"

# --- better-sqlite3 ---
Write-Host ""
Write-Host "=== Building better-sqlite3 ==="
$bsDir = Join-Path $root 'node_modules\better-sqlite3'
Push-Location $bsDir
cmd /c "`"$nodeGyp`" rebuild --release --msvs_version=2022"
$bsExit = $LASTEXITCODE
Pop-Location
Write-Host "better-sqlite3 exit: $bsExit"

# --- sharp ---
Write-Host ""
Write-Host "=== Building sharp (prebuild download) ==="
$sharpDir = Join-Path $root 'node_modules\sharp'
Push-Location $sharpDir
# sharp ships prebuilt binaries; just run its install script
$env:SHARP_IGNORE_GLOBAL_LIBVIPS = '1'
node install/check 2>&1
$sharpExit = $LASTEXITCODE
Pop-Location
Write-Host "sharp exit: $sharpExit"

Write-Host ""
if ($bsExit -eq 0) {
  Write-Host "SUCCESS — better-sqlite3 built. sharp=$sharpExit"
  Write-Host "Next: npm test"
} else {
  Write-Host "FAILED — better-sqlite3 build error. See output above."
  exit 1
}
