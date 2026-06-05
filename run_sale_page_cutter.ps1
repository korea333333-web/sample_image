$ErrorActionPreference = "Stop"

$runtimeNode = "C:\Users\kikuke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$runtimeModules = "C:\Users\kikuke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$scriptPath = Join-Path $PSScriptRoot "sale-page-cutter.js"

if (-not (Test-Path $runtimeNode)) {
  $runtimeNode = "node"
}

$env:NODE_PATH = $runtimeModules
$env:CODEX_NODE_MODULES = $runtimeModules

$url = Read-Host "Paste sale page URL"
$product = Read-Host "Product folder name, example: hand_lotion"
$out = Read-Host "Output base folder. Leave empty to use the default sample_image folder"

$argsList = @($scriptPath, "--url", $url, "--product", $product)
if ($out.Trim().Length -gt 0) {
  $argsList += @("--out", $out)
}

& $runtimeNode $argsList

Write-Host ""
Write-Host "Done. Check the folder printed above."
Read-Host "Press Enter to close"
