$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH

# Check GitHub releases API for better-sqlite3 available assets
$version = '11.10.0'
$apiUrl = "https://api.github.com/repos/WiseLibs/better-sqlite3/releases/tags/v$version"
Write-Host "Checking: $apiUrl"
try {
  $resp = Invoke-RestMethod -Uri $apiUrl -Headers @{'User-Agent'='node-gyp'}
  $assets = $resp.assets | Select-Object -ExpandProperty name | Sort-Object
  Write-Host "Available prebuilts for v$version:"
  $assets | ForEach-Object { Write-Host "  $_" }
} catch {
  Write-Host "API error: $_"
  # Fallback: check latest release
  $latestUrl = "https://api.github.com/repos/WiseLibs/better-sqlite3/releases/latest"
  $latest = Invoke-RestMethod -Uri $latestUrl -Headers @{'User-Agent'='node-gyp'}
  Write-Host "Latest version: $($latest.tag_name)"
  Write-Host "Latest assets:"
  $latest.assets | Select-Object -ExpandProperty name | Sort-Object | ForEach-Object { Write-Host "  $_" }
}
