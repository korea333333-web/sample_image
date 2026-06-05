$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "sale-page-cutter.js"

if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
  Write-Host "Installing project packages. This is needed only when node_modules is missing..."
  Push-Location $PSScriptRoot
  try {
    npm install
  } finally {
    Pop-Location
  }
}

$url = Read-Host "Paste sale page URL"
$product = Read-Host "Product folder name, example: hand_lotion"
$out = Read-Host "Output base folder. Leave empty to use the default sample_image folder"

$argsList = @($scriptPath, "--url", $url, "--product", $product)
if ($out.Trim().Length -gt 0) {
  $argsList += @("--out", $out)
}

& node $argsList

Write-Host ""
Write-Host "Done. Check the folder printed above."
Read-Host "Press Enter to close"
