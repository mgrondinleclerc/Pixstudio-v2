$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
  $env:Path = "$cargoBin;$env:Path"
}

Push-Location $projectRoot
try {
  npm run tauri:build
  if ($LASTEXITCODE -ne 0) { throw "Le build Tauri a échoué." }

  $buildDirectory = Join-Path $workspaceRoot "build"
  New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null

  $artifacts = @(
    "src-tauri\target\release\pixestudio.exe",
    "src-tauri\target\release\bundle\nsis\PixeStudio_0.1.0_x64-setup.exe",
    "src-tauri\target\release\bundle\msi\PixeStudio_0.1.0_x64_en-US.msi"
  )

  foreach ($artifact in $artifacts) {
    $source = Join-Path $projectRoot $artifact
    if (-not (Test-Path $source)) { throw "Artefact introuvable : $source" }
    Copy-Item -LiteralPath $source -Destination $buildDirectory -Force
  }

  Write-Host "Build Windows copié dans : $buildDirectory"
  Get-ChildItem -LiteralPath $buildDirectory -File | Select-Object Name, Length, LastWriteTime
}
finally {
  Pop-Location
}
