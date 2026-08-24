# Changelog

All notable changes to Brand Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-08-24

First public release. Brand Studio is an offline desktop design studio for
Windows: it keeps your brands, designs, videos and exports as ordinary files on
your own disk, with no account, no cloud and no subscription.

### Design editor

- Multi-page canvas with text, shapes, images, icons and groups
- Eleven layer types, including parametric hardware panel components (knobs,
  faders, jacks, LEDs, displays) for audio equipment front panels
- Linear and radial gradients, per-layer blend modes, circular masks, borders
  and corner radii
- Image filters: brightness, contrast, saturation, hue, temperature, blur,
  grayscale, plus parametric drop shadows and colour overlays
- Smart guides, draggable rulers, rotation-aware alignment and distribution,
  keyboard z-ordering, eyedropper, recent colours
- Undo/redo with history coalescing, numeric X/Y/W/H fields, aspect-ratio lock
- Around 5,400 offline icons (Lucide outline icons and Simple Icons brand marks)

### Brand kits, templates and planning

- Brand colours, fonts and four logo slots, applied by typographic role
- AI palette extraction from any image
- Reusable templates with `{{variable}}` substitution and batch fill from CSV
- Content planner with monthly, weekly and daily views
- Asset library with drag-and-drop import, search and per-brand scoping

### Video and reels

- Scene-based timeline with per-scene duration, background and video clips
- Enter/exit animations with easing, beat detection and waveform display
- Scene transitions, background music with fade-out
- MP4 export via FFmpeg, with progress reporting and cancellation
- Convert an existing design into a music-synced reel

### Export

- PNG, JPG and WebP at 1×, 2× and 3×
- PDF pages at their true physical size — an A4 really is 210 × 297 mm at
  300 DPI, and hardware panel presets export 1:1 for manufacturing
- Multi-page PDF assembly, and "Save as…" to any location
- Every export is recorded and browsable in the Exports page

### Background removal

- Local ONNX models (`isnet-general-use`, and `u2net_human_seg` for portraits) —
  unlimited, offline, no credits or subscription
- Soft, antialiased cutout edges, with an optional alpha-matting mode

### Privacy and offline operation

- No telemetry, no analytics, no account, no automatic network requests
- The installer bundles everything needed: a frozen Python sidecar, FFmpeg and
  the background-removal models. No internet connection is required, at install
  time or ever
- The only outbound request the app can make is the manual "Check for updates"
  button in Settings, and only when you click it

### Known limitations

Brand Studio is a layout and content tool, not a vector illustration suite.
There is no pen/Bézier tool, no editable SVG import, no text on a path, no
auto-layout, no reusable components with instances, and no CMYK or bleed for
commercial prepress. Image masks are rectangular or circular only. See
"What Brand Studio is not" in the README.

The installer is not code-signed, so Windows SmartScreen shows a warning on
first run — see the README for how to proceed and how to verify the download
against the published SHA-256 checksum.

[1.0.0]: https://github.com/Angelo-politek/brand-studio/releases/tag/v1.0.0
