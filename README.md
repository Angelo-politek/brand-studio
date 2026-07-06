# Brand Studio

**Offline-first brand management and social content creation studio for Windows.**

Brand Studio runs entirely on your machine — no cloud, no subscriptions, no data leaving your device. Design graphics, edit videos, manage your brand kit, and plan your content calendar from a single desktop app.

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

## System Requirements

| Component | Minimum |
|-----------|---------|
| OS | Windows 10 or Windows 11 (64-bit) |
| RAM | 4 GB (8 GB recommended) |
| Python | 3.10 or later (for AI features and video export) |
| FFmpeg | Included in the Python backend dependencies |

> **Python** must be installed and available on PATH. Brand Studio will automatically create a virtual environment and install its Python dependencies on first launch.

---

## Installation

1. Download `Brand Studio-1.0.0-setup.exe` from the [Releases](../../releases) page.
2. Run the installer and follow the prompts.
3. Launch **Brand Studio** from the Start menu or Desktop shortcut.
4. On first launch, the app will set up the Python backend automatically (requires an internet connection for pip install).

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

```bash
npm run package
```

Output: `dist/Brand Studio-1.0.0-setup.exe`

The build bundles the Python backend sources in `extraResources/backend/`. The virtual environment is **not** bundled — it is created in `%APPDATA%\brand-studio\python-venv\` on first launch.

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

MIT © Brand Studio
