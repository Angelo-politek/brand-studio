# Brand Studio

**A design studio that runs entirely on your machine. No cloud, no account, no subscription.**

Design graphics, edit videos, manage brand kits and plan content — all from one desktop app, all
stored as ordinary files on your own disk. Your work stays yours: if this project ever disappears,
your designs, assets and exports are still sitting in a folder you control.

Brand Studio is general-purpose by design, and meant to be shaped around what *you* make. It ships
with the everyday essentials — social formats, print sizes, marketing banners — plus an example of
how far that customisation goes: a built-in kit for **audio hardware front panels** (Eurorack and
19" rack presets with real millimetre dimensions, plus knobs, faders, jacks, LEDs and displays as
first-class, parametric objects).

That kit exists because it scratched a real itch. The point is that nothing about it is special:
it is built on the same layer model as everything else, so the same approach can produce a kit for
board-game cards, lab equipment labels, or whatever your own work needs. It is open source — fork
it and build your own.

---

## Features

### Design Editor
- Multi-page canvas with text, shapes, images, and groups
- Full layer controls: resize, rotate, lock, hide, z-order, opacity
- Snap guides, alignment, distribution, and pixel-perfect nudge
- Inline text editing, image crop, and filters (brightness, contrast, blur, saturation)
- Color overlay with multiply / overlay / color blend modes
- Undo/redo stack (Ctrl+Z / Ctrl+Shift+Z)
- Zoom and pan (Ctrl+0 to fit, Ctrl+1 for 100%, scroll wheel)

### Brand Kit
- Primary, secondary, and accent colors — always available in every color picker
- Heading, body, and alt fonts (upload custom TTF/OTF)
- Four logo slots: main, white, dark, icon
- AI palette extraction from any image (requires Python backend)

### Templates
- Save any design as a reusable template
- Variable substitution: `{{product_name}}`, `{{date}}`, etc.
- Batch fill: populate multiple templates from a CSV in one click

### Export
| Format | Notes |
|--------|-------|
| PNG | With transparency; 1×, 2×, 3× scale |
| JPG | Quality 92 % |
| WebP | Lossy |
| PDF | Multi-page assembly |
| MP4 | Via video editor + FFmpeg |

### Video Editor
- Scene-based timeline with per-scene duration and background
- Video clips with trim handles, volume, fit (cover/contain), and color looks (warm, cool, B&W, contrast, brand)
- Overlay layers with animated enter/exit effects (fade, slide, pop, flash, pulse, shake)
- Beat-synced animation periods
- Scene transitions: fade, slide left, slide up
- Global background audio track
- Full MP4 export via FFmpeg

### Content Planner
- Monthly, weekly, and daily calendar views
- Statuses: Idea → Draft → Ready → Scheduled → Published
- Link planner items directly to a design project
- Upcoming widget on the dashboard

### Asset Library
- Categories: Logos, Images, Backgrounds, Icons, Videos, Audio, Documents
- Drag-and-drop import with auto-categorization by MIME type
- Full-text search and thumbnail previews
- Per-brand scoping

---

## What Brand Studio is not

Being honest about this up front saves everyone time. Brand Studio is a layout and content tool,
not a vector illustration suite. It does **not** have:

- a pen / Bézier path tool — shapes are parametric primitives
- SVG import as editable vectors (SVG files import as assets, not as paths)
- text on a path, auto-layout, or reusable components/symbols with instances
- CMYK, bleed or crop marks — PDF export is RGB and not print-shop ready
- arbitrary clipping masks (image masks are rectangular or circular)

If you need those, Inkscape and Illustrator do them well — and Brand Studio is happy to sit
alongside them. What it gives you instead is everything in one offline place, with your brand
applied consistently across designs, reels and exports.

---

## System Requirements

| Component | Minimum |
|-----------|---------|
| OS | Windows 10 or Windows 11 (64-bit) |
| RAM | 4 GB (8 GB recommended) |

> The installer bundles everything: a frozen Python sidecar (no system Python needed), FFmpeg, and the background-removal model. No internet connection is required, at install time or ever.
>
> **Development only:** running from sources needs Python 3.10+ on PATH (a venv is created on first launch) and FFmpeg on PATH.

---

## Installation

1. Download `brand-studio-1.0.0-setup.exe` from the [Releases](../../releases) page.
2. Run the installer and follow the prompts.
3. Launch **Brand Studio** from the Start menu or Desktop shortcut. Everything works offline out of the box.

### "Windows protected your PC"

The installer is **not code-signed** — a certificate costs a few hundred euros a year, which is
hard to justify for a free project. Windows SmartScreen will therefore show a blue warning the
first time you run it:

> Click **More info** → **Run anyway**.

If you would rather verify the download yourself, every release lists the SHA-256 checksum of the
installer. On Windows:

```powershell
Get-FileHash .rand-studio-1.0.0-setup.exe -Algorithm SHA256
```

Compare the result with the hash published on the release page. The full source is in this
repository, and the installer is built by a public GitHub Actions workflow
([`release.yml`](.github/workflows/release.yml)) — so you can also just build it yourself.

---

## Development Setup

### Prerequisites
- Node.js 20+
- Python 3.10+
- npm

### Install dependencies

```bash
npm install
```

### Run in development mode

On Windows, the app must be started without the `ELECTRON_RUN_AS_NODE` environment variable:

```bash
# PowerShell
$env:ELECTRON_RUN_AS_NODE=''; npm run dev

# Git Bash / WSL
env -u ELECTRON_RUN_AS_NODE npm run dev
```

### Run tests

```bash
npm test
```

### Type-check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

---

## Building the Installer

From a clean clone, everything the packaged build needs (`backend/.venv`,
FFmpeg, the ONNX models) is gitignored and has to be fetched once:

```bash
npm ci                              # Node dependencies
powershell -ExecutionPolicy Bypass -File scripts/setup-build-env.ps1
npm run package:full                # freezes the Python sidecar (PyInstaller), then builds the installer
```

`scripts/setup-build-env.ps1` is idempotent — safe to re-run on a machine
that already has some or all of these in place, it skips whatever is already
present and verified. It:
- creates `backend/.venv` (using the system Python) and installs `requirements.txt` + `requirements-dev.txt`
- downloads FFmpeg from a pinned, checksummed release and extracts `ffmpeg.exe` into `resources/bin/win/`
- downloads the two ONNX background-removal models into `backend/models/`, each checksum-verified

Once the build environment is prepared, `npm run package` (without `:full`)
reuses the last sidecar build:

```bash
npm run package:full   # freezes the Python sidecar (PyInstaller), then builds the installer
npm run package        # installer only (reuses the last sidecar build)
```

Output: `dist/brand-studio-1.0.0-setup.exe`

The installer bundles:
- the PyInstaller-frozen sidecar (`backend/dist-sidecar/` → `resources/sidecar/`) — no system Python needed
- FFmpeg (`resources/bin/win/ffmpeg.exe` → `resources/bin/`, wired to the sidecar via `BS_FFMPEG`)
- the rembg models (`backend/models/{isnet-general-use,u2net_human_seg}.onnx` → `resources/backend/models/`)

Tagging a release (`git tag v1.0.0 && git push --tags`) triggers
`.github/workflows/release.yml`, which runs the same steps on
`windows-latest` and publishes the installer to GitHub Releases.

---

## Project Structure

```
BrandStudio/
├── src/
│   ├── main/          # Electron main process (IPC, DB, Python sidecar)
│   ├── preload/       # Context bridge
│   ├── renderer/      # React UI
│   └── shared/        # Types and IPC channel names
├── backend/           # Python FastAPI sidecar (video export, AI tools)
├── tests/             # Vitest unit tests
├── electron-builder.yml
└── package.json
```

---

## Architecture

Brand Studio uses a three-process architecture:

| Process | Role |
|---------|------|
| **Electron main** | SQLite database, file I/O, IPC routing, Python sidecar lifecycle |
| **Electron renderer** | React + Konva UI, Zustand state, export rendering |
| **Python sidecar** | FFmpeg video export, background removal (rembg), palette extraction, image tinting |

The renderer communicates with the main process via a typed IPC bridge (`window.api.*`). The Python sidecar is accessed directly from the renderer over localhost with an ephemeral bearer token generated at startup.

All data is stored locally in `%APPDATA%\brand-studio\`:
- `brand-studio.db` — SQLite database
- `assets/` — uploaded media
- `exports/` — exported files
- `python-venv/` — Python virtual environment

---

## License

GPLv3 © Brand Studio

Brand Studio is licensed under the [GNU General Public License v3.0](LICENSE) (or later). This is a change from the project's earlier MIT intent: the app bundles an FFmpeg build compiled with `--enable-gpl --enable-version3` (for `libx264` MP4 export), and GPLv3 is the license that combination legally requires for the whole application. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for FFmpeg's source offer and the licenses of all bundled dependencies and models.
