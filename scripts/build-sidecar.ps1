# Freeze the Python sidecar with PyInstaller (see backend/sidecar.spec).
# Output: backend/dist-sidecar/brandstudio-sidecar/ -- picked up by
# electron-builder's extraResources (electron-builder.yml).
$ErrorActionPreference = "Stop"

$backend = Resolve-Path (Join-Path $PSScriptRoot "..\backend")
$python = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "backend venv not found at $python -- create it and pip install -r requirements.txt + pyinstaller"
}

Push-Location $backend
try {
    & $python -m PyInstaller --noconfirm --clean `
        --distpath (Join-Path $backend "dist-sidecar") `
        --workpath (Join-Path $backend "build-sidecar") `
        (Join-Path $backend "sidecar.spec")
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$exe = Join-Path $backend "dist-sidecar\brandstudio-sidecar\brandstudio-sidecar.exe"
if (-not (Test-Path $exe)) { throw "expected output missing: $exe" }
Write-Host "Sidecar frozen at $exe"
