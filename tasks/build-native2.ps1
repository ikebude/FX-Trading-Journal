# Build better-sqlite3 after patching node-gyp to accept VS 18 preview
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$root = 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'
Set-Location $root

# Load MSVC environment (sets VCINSTALLDIR, VCToolsVersion, PATH with cl.exe)
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
Write-Host "VCINSTALLDIR: $env:VCINSTALLDIR"
Write-Host "VCToolsVersion: $env:VCToolsVersion"
if (-not $cl) { exit 1 }

# Absolute path to node-gyp
$nodeGyp = Join-Path $root 'node_modules\.bin\node-gyp.cmd'

# --- better-sqlite3: NO --msvs_version (would conflict with envVcInstallDir check) ---
Write-Host ""
Write-Host "=== Building better-sqlite3 ==="
$bsDir = Join-Path $root 'node_modules\better-sqlite3'
Push-Location $bsDir
cmd /c "`"$nodeGyp`" rebuild --release --verbose"
$bsExit = $LASTEXITCODE
Pop-Location
Write-Host "better-sqlite3 exit: $bsExit"

# Check the binary exists
$binary = Join-Path $root 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
if (Test-Path $binary) {
  Write-Host "Binary confirmed: $binary"
} else {
  Write-Host "ERROR: binary not found at $binary"
}

Write-Host ""
if ($bsExit -eq 0) {
  Write-Host "SUCCESS — native build complete."
} else {
  Write-Host "FAILED — see output above."
  exit 1
}
