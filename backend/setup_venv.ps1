# Creates the backend virtual environment and installs dependencies.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File backend\setup_venv.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $here ".venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
    Write-Host "Creating virtual environment..."
    python -m venv (Join-Path $here ".venv")
}

& $py -m pip install --upgrade pip
& $py -m pip install -r (Join-Path $here "requirements.txt")

# Optional: pre-download the rembg u2net model so background removal works offline.
$env:U2NET_HOME = Join-Path $here "models"
Write-Host "Pre-fetching background-removal model (u2net)..."
& $py -c "from rembg import new_session; new_session('u2net'); print('model ready')"

Write-Host "Backend venv ready."
