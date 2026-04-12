$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$envLines = cmd /c "`"$vcvars`" && set" 2>&1
foreach ($line in $envLines) {
  if ($line -match '^(Visual|MSVC|VS|Platform|VCINSTALLDIR|LIB|INCLUDE|WindowsSDKVer)') {
    Write-Host $line
  }
}
