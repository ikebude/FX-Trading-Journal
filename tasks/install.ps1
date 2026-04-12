# Bootstrap MSVC env then run npm install
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
Set-Location 'C:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal'

$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$envLines = cmd /c "`"$vcvars`" && set" 2>&1
foreach ($line in $envLines) {
  if ($line -match '^([A-Za-z_][^=]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}

$clPath = (Get-Command cl.exe -ErrorAction SilentlyContinue)
$npmPath = (Get-Command npm -ErrorAction SilentlyContinue)
Write-Host "cl.exe: $(if ($clPath) { $clPath.Source } else { 'NOT FOUND' })"
Write-Host "npm:    $(if ($npmPath) { $npmPath.Source } else { 'NOT FOUND' })"
Write-Host ""
Write-Host "Running npm install..."
npm install
Write-Host "npm install exit code: $LASTEXITCODE"
