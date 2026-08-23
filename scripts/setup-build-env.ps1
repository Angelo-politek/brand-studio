<#
.SYNOPSIS
    Prepares a clean machine to build Brand Studio's Windows installer.

.DESCRIPTION
    Idempotent setup script that:
      1. Creates backend/.venv with the system Python (if missing).
      2. Installs backend/requirements.txt + backend/requirements-dev.txt into it.
      3. Downloads a pinned FFmpeg build, verifies its SHA256, and extracts
         only ffmpeg.exe into resources/bin/win/.
      4. Downloads the two ONNX background-removal models used by the app,
         verifies their SHA256, and places them in backend/models/.

    Every step is skipped if its output already exists and (where a checksum
    is known) matches, so re-running this script on a machine that already
    has everything is fast and safe.

    Run from the repo root:
        powershell -ExecutionPolicy Bypass -File scripts\setup-build-env.ps1

.NOTES
    Only ffmpeg.exe is fetched (no ffprobe.exe) and only the two ONNX models
    the app actually loads (isnet-general-use, u2net_human_seg) are fetched
    (no legacy u2net.onnx) — see backend/routers/bg_remove.py and
    backend/ffmpeg_util.py for what the app expects at runtime.
#>

[CmdletBinding()]
param(
    # Re-download / reinstall everything even if already present.
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Invoke-WebRequest is much faster without the progress UI.

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

$RepoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend    = Join-Path $RepoRoot "backend"
$VenvDir    = Join-Path $Backend ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$ModelsDir  = Join-Path $Backend "models"
$BinDir     = Join-Path $RepoRoot "resources\bin\win"
$DownloadCache = Join-Path $RepoRoot ".setup-cache"

# ---------------------------------------------------------------------------
# Pinned sources
# ---------------------------------------------------------------------------
# FFmpeg: gyan.dev "essentials" build, mirrored as a versioned GitHub release
# (GyanD/codexffmpeg). Chosen over the "full" build (previously used) because
# essentials still ships libx264/libx265 (everything Brand Studio's video
# export needs) at ~135 MB less download/install size. The URL is pinned to
# a specific tag (9.0.1), not "latest", so it never silently changes under
# us; bump FFmpegVersion + FFmpegZipSha256 together when upgrading.
#
# SHA256 verified against GitHub's release-asset "digest" field on 2026-08-23
# (https://api.github.com/repos/GyanD/codexffmpeg/releases/tags/9.0.1) —
# this is a real, confirmed checksum, not a placeholder.
$FFmpegVersion   = "9.0.1"
$FFmpegZipUrl    = "https://github.com/GyanD/codexffmpeg/releases/download/$FFmpegVersion/ffmpeg-$FFmpegVersion-essentials_build.zip"
$FFmpegZipSha256 = "FEC81AE03971D9DD4BE3EBE02E263BD2EC1D789483F931BDBA5F5715E65DA2E9"
# Path of ffmpeg.exe inside the extracted zip:
$FFmpegExeInZip  = "ffmpeg-$FFmpegVersion-essentials_build\bin\ffmpeg.exe"

# ONNX models: official rembg release assets (danielgatis/rembg, tag v0.0.0 —
# this is rembg's own permanent model-hosting tag, pinned in rembg's source
# at rembg/sessions/{dis_general_use,u2net_human_seg}.py). SHA256 verified on
# 2026-08-23 by hashing the actual files from a previously-working local
# install and cross-checking their MD5 against the checksums rembg's own
# downloader (pooch) pins in source — both matched exactly, so these SHA256
# values are real and confirmed, not guessed.
$Models = @(
    @{
        Name   = "isnet-general-use.onnx"
        Url    = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"
        Sha256 = "60920E99C45464F2BA57BEE2AD08C919A52BBF852739E96947FBB4358C0D964A"
    },
    @{
        Name   = "u2net_human_seg.onnx"
        Url    = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx"
        Sha256 = "01EB6A29A5C4D8EDB30B56ADAD9BB3A2A0535338E480724A213E0ACFD2D1C73C"
    }
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Info($msg) {
    Write-Host "    $msg"
}

function Write-Skip($msg) {
    Write-Host "    [skip] $msg" -ForegroundColor DarkGray
}

function Write-Ok($msg) {
    Write-Host "    [ok] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "    [warn] $msg" -ForegroundColor Yellow
}

function Test-Sha256 {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [AllowEmptyString()] [string]$ExpectedSha256 = ""
    )
    if ([string]::IsNullOrWhiteSpace($ExpectedSha256) -or $ExpectedSha256 -like "TODO*") {
        Write-Warn "no known checksum for '$Path' -- skipping verification (TODO: populate it)"
        return $true
    }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash
    if ($actual.ToUpperInvariant() -ne $ExpectedSha256.ToUpperInvariant()) {
        Write-Host "    [FAIL] checksum mismatch for '$Path'" -ForegroundColor Red
        Write-Host "           expected: $ExpectedSha256"
        Write-Host "           actual:   $actual"
        return $false
    }
    return $true
}

function Invoke-DownloadWithRetry {
    param(
        [Parameter(Mandatory)] [string]$Url,
        [Parameter(Mandatory)] [string]$OutFile,
        [int]$MaxAttempts = 3
    )
    $attempt = 0
    while ($attempt -lt $MaxAttempts) {
        $attempt++
        try {
            Write-Info "downloading (attempt $attempt/$MaxAttempts): $Url"
            Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
            return
        } catch {
            Write-Warn "download attempt $attempt failed: $($_.Exception.Message)"
            if (Test-Path $OutFile) { Remove-Item -Force $OutFile -ErrorAction SilentlyContinue }
            if ($attempt -ge $MaxAttempts) { throw }
            Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 15))
        }
    }
}

# ---------------------------------------------------------------------------
# 0. Sanity
# ---------------------------------------------------------------------------

Write-Step "Checking prerequisites"

$systemPython = $null
foreach ($candidate in @("python", "python3")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { $systemPython = $cmd.Source; break }
}
if (-not $systemPython) {
    Write-Host ""
    Write-Host "ERROR: no Python interpreter found on PATH." -ForegroundColor Red
    Write-Host "Install Python 3.10+ from https://www.python.org/downloads/windows/" -ForegroundColor Red
    Write-Host "and make sure 'python' is on PATH, then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Ok "system Python found: $systemPython"

if (-not (Test-Path $DownloadCache)) {
    New-Item -ItemType Directory -Path $DownloadCache -Force | Out-Null
}

# ---------------------------------------------------------------------------
# 1. Python virtual environment
# ---------------------------------------------------------------------------

Write-Step "Backend virtual environment (backend\.venv)"

if ((Test-Path $VenvPython) -and -not $Force) {
    Write-Skip "backend\.venv already exists ($VenvPython)"
} else {
    Write-Info "creating venv with $systemPython ..."
    & $systemPython -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "python -m venv failed with exit code $LASTEXITCODE" }
    Write-Ok "venv created at $VenvDir"
}

if (-not (Test-Path $VenvPython)) {
    throw "expected venv Python missing after setup: $VenvPython"
}

Write-Step "Installing Python dependencies"

& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed with exit code $LASTEXITCODE" }

$reqFile = Join-Path $Backend "requirements.txt"
$devReqFile = Join-Path $Backend "requirements-dev.txt"

Write-Info "installing requirements.txt ..."
& $VenvPython -m pip install -r $reqFile
if ($LASTEXITCODE -ne 0) { throw "pip install -r requirements.txt failed with exit code $LASTEXITCODE" }
Write-Ok "runtime dependencies installed"

if (Test-Path $devReqFile) {
    Write-Info "installing requirements-dev.txt ..."
    & $VenvPython -m pip install -r $devReqFile
    if ($LASTEXITCODE -ne 0) { throw "pip install -r requirements-dev.txt failed with exit code $LASTEXITCODE" }
    Write-Ok "dev dependencies installed (pyinstaller)"
} else {
    Write-Warn "requirements-dev.txt not found at $devReqFile -- skipping"
}

# ---------------------------------------------------------------------------
# 2. FFmpeg
# ---------------------------------------------------------------------------

Write-Step "FFmpeg (resources\bin\win\ffmpeg.exe)"

$ffmpegExeTarget = Join-Path $BinDir "ffmpeg.exe"
$ffmpegAlreadyOk = $false

if ((Test-Path $ffmpegExeTarget) -and -not $Force) {
    if (Test-Sha256 -Path $ffmpegExeTarget -ExpectedSha256 "") {
        # We don't have a per-exe checksum (only the zip's), so presence is
        # our idempotency signal; re-run with -Force to refresh.
        Write-Skip "ffmpeg.exe already present at $ffmpegExeTarget"
        $ffmpegAlreadyOk = $true
    }
}

if (-not $ffmpegAlreadyOk) {
    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }

    $zipPath = Join-Path $DownloadCache "ffmpeg-$FFmpegVersion-essentials_build.zip"

    $needDownload = $true
    if ((Test-Path $zipPath) -and -not $Force) {
        if (Test-Sha256 -Path $zipPath -ExpectedSha256 $FFmpegZipSha256) {
            Write-Skip "using cached, verified archive: $zipPath"
            $needDownload = $false
        } else {
            Write-Warn "cached archive failed checksum, re-downloading"
            Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
        }
    }

    if ($needDownload) {
        Invoke-DownloadWithRetry -Url $FFmpegZipUrl -OutFile $zipPath
        if (-not (Test-Sha256 -Path $zipPath -ExpectedSha256 $FFmpegZipSha256)) {
            Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
            throw "FFmpeg archive failed SHA256 verification -- aborting (see mismatch above)"
        }
        Write-Ok "FFmpeg archive downloaded and verified"
    }

    $extractDir = Join-Path $DownloadCache "ffmpeg-extract"
    if (Test-Path $extractDir) {
        Remove-Item -Recurse -Force $extractDir
    }
    Write-Info "extracting archive ..."
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $extractedExe = Join-Path $extractDir $FFmpegExeInZip
    if (-not (Test-Path $extractedExe)) {
        # Fall back to a search in case gyan.dev changes the internal folder
        # name (e.g. a point-release naming tweak) while the zip URL itself
        # stays what we asked for.
        Write-Warn "expected path not found in archive ($FFmpegExeInZip), searching ..."
        $found = Get-ChildItem -Path $extractDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
        if (-not $found) { throw "ffmpeg.exe not found anywhere inside the downloaded archive" }
        $extractedExe = $found.FullName
    }

    Copy-Item -Path $extractedExe -Destination $ffmpegExeTarget -Force
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    Write-Ok "ffmpeg.exe placed at $ffmpegExeTarget"
}

# ---------------------------------------------------------------------------
# 3. ONNX models
# ---------------------------------------------------------------------------

Write-Step "Background-removal ONNX models (backend\models)"

if (-not (Test-Path $ModelsDir)) {
    New-Item -ItemType Directory -Path $ModelsDir -Force | Out-Null
}

foreach ($model in $Models) {
    $target = Join-Path $ModelsDir $model.Name
    Write-Info "checking $($model.Name) ..."

    if ((Test-Path $target) -and -not $Force) {
        if (Test-Sha256 -Path $target -ExpectedSha256 $model.Sha256) {
            Write-Skip "$($model.Name) already present and verified"
            continue
        } else {
            Write-Warn "$($model.Name) present but failed checksum, re-downloading"
            Remove-Item -Force $target -ErrorAction SilentlyContinue
        }
    }

    $tmpTarget = "$target.download"
    Invoke-DownloadWithRetry -Url $model.Url -OutFile $tmpTarget

    if (-not (Test-Sha256 -Path $tmpTarget -ExpectedSha256 $model.Sha256)) {
        Remove-Item -Force $tmpTarget -ErrorAction SilentlyContinue
        throw "$($model.Name) failed SHA256 verification -- aborting (see mismatch above)"
    }

    Move-Item -Path $tmpTarget -Destination $target -Force
    Write-Ok "$($model.Name) downloaded and verified"
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Step "Build environment ready"
Write-Info "backend venv:  $VenvDir"
Write-Info "ffmpeg:        $ffmpegExeTarget"
Write-Info "models:        $ModelsDir"
Write-Host ""
Write-Host "Next: npm run package:full" -ForegroundColor Green
