# Third-Party Notices

Brand Studio is licensed under the GNU General Public License v3.0 (or later) —
see [`LICENSE`](LICENSE). This file lists the third-party software, models, and
assets bundled with the packaged Windows application, along with their
licenses and, where required, additional notices.

---

## 1. FFmpeg (GPLv3) — bundled binary

Brand Studio bundles a pre-built `ffmpeg.exe` from the
[gyan.dev Windows builds](https://www.gyan.dev/ffmpeg/builds/) to perform
video export (scene concatenation, encoding to MP4 with `libx264`).

- **Build:** `ffmpeg-9.0.1-essentials_build` (gyan.dev "essentials" build)
- **Release tag:** `9.0.1` (mirrored at <https://github.com/GyanD/codexffmpeg/releases/tag/9.0.1>)
- **Upstream version:** FFmpeg 9.0.1
- **Configuration:** built with `--enable-gpl --enable-version3`, plus
  `--enable-libx264 --enable-libx265` and numerous other optional GPL/LGPL
  components (run `ffmpeg -version` for the complete configure line shipped
  in this build).
- **License:** GNU General Public License v3 (because the build is configured
  with `--enable-gpl --enable-version3` and links GPL-licensed components
  such as `libx264`/`libx265`). FFmpeg itself is a project with contributions
  under LGPL v2.1+ and GPL v2+; this specific build's `--enable-version3` flag
  makes the effective license of the binary GPLv3.
- **Copyright:** © The FFmpeg developers. See
  <https://ffmpeg.org/legal.html> and <https://git.ffmpeg.org/ffmpeg.git>.

### Written offer for corresponding source (GPLv3 §6)

In accordance with GPLv3 Section 6, Brand Studio's authors offer, for a
period of at least three years after the corresponding Brand Studio
distribution, to provide the complete corresponding machine-readable source
code for this exact FFmpeg build, on a medium customarily used for software
interchange, for a charge no more than the cost of physically performing
the source distribution.

To request the source, open an issue on the Brand Studio repository or
contact the maintainers listed there. The offer covers the exact FFmpeg
source tree used to produce build `9.0.1` (gyan.dev "essentials"
configuration).

In the meantime, the source is also obtainable directly from upstream,
which satisfies GPLv3 §6(b)/(d) as a valid alternative to a written offer:

- FFmpeg source (all versions/revisions): <https://git.ffmpeg.org/ffmpeg.git>
  and mirrors at <https://github.com/FFmpeg/FFmpeg>
- gyan.dev build scripts and patches used for the Windows builds:
  <https://github.com/GyanD/codexffmpeg>
- The exact build bundled here corresponds to release tag `9.0.1` at
  <https://github.com/GyanD/codexffmpeg/releases/tag/9.0.1>, built from
  FFmpeg 9.0.1 (tag `n9.0.1` in the FFmpeg source tree above).

FFmpeg is provided "AS IS", without warranty of any kind, per GPLv3 §15–16.

---

## 2. Background-removal (ONNX) models

Brand Studio bundles the following pre-trained ONNX model weights, used by
the Python sidecar (`rembg`) for one-click background removal
(`backend/routers/bg_remove.py`). Both are copied into the packaged app via
`electron-builder.yml` → `extraResources`.

### 2a. `isnet-general-use.onnx` — DEFAULT model — commercial-use caveat

- **Origin:** derived from IS-Net, from the DIS (Dichotomous Image
  Segmentation) project by Xuebin Qin et al.
  (<https://github.com/xuebinqin/DIS>), redistributed as a pre-converted
  ONNX weight file by the `rembg` project.
- **Code license (DIS repository):** Apache License 2.0 ("Our code and
  evaluation metric use Apache License 2.0.")
- **Training data / weights terms — IMPORTANT:** the DIS5K dataset that
  IS-Net (and this `isnet-general-use` checkpoint) was trained on is
  distributed under a separate **DIS5K Dataset Terms of Use**, which states:

  > "The Dataset is available for non-commercial use in research or
  > educational purpose. ... Without permission from the original authors,
  > commercial use of this dataset is prohibited even after copying,
  > editing, processing or any operations of this database. Please contact
  > us for commercial use or if you are uncertain about the decision."

  This document governs the DIS5K images/annotations directly; it does not
  explicitly mention "model weights" by name, and the upstream project does
  not publish a separate license specifically for the exported
  `isnet-general-use.onnx` checkpoint. The phrase "any operations of this
  database" is broad enough that a model trained on DIS5K is reasonably
  read as within its scope, but this has not been tested and is not free
  from doubt. `rembg`'s own documentation is explicit that it takes no
  position on this: model weights "carry their own licenses, independent
  of rembg's MIT license — check the linked source before using any model
  commercially."
  **Practical conclusion: treat `isnet-general-use.onnx` as non-commercial /
  research-use only unless and until permission is obtained from the DIS
  authors.** This is a real risk for a shipped commercial product and is
  called out again in the risk summary below.

### 2b. `u2net_human_seg.onnx` — Person mode

- **Origin:** U²-Net ("U Square Net"), Qin et al.,
  <https://github.com/xuebinqin/U-2-Net>, redistributed as ONNX by `rembg`.
- **License:** Apache License 2.0 (the U²-Net repository is Apache-2.0 and,
  unlike DIS, does not carry a separate non-commercial dataset-terms
  restriction on its released model checkpoints).
- **Copyright:** © Xuebin Qin and contributors.

> Note: `backend/routers/bg_remove.py` also lists `u2net` (the general
> U²-Net checkpoint, `u2net.onnx`) as an allowed model name, and
> `backend/models/README.md` still describes it as the model rembg
> downloads by default in a dev environment. However, the **packaged app's
> `electron-builder.yml` only copies `isnet-general-use.onnx` and
> `u2net_human_seg.onnx`** into `extraResources` — `u2net.onnx` is
> explicitly excluded from the shipped build ("The legacy u2net.onnx is not
> shipped."). If a packaged build ever requests `model=u2net` it would have
> no local weights to load. `u2net.onnx`, if it is ever bundled again in the
> future, is Apache-2.0 like `u2net_human_seg.onnx` above.

---

## 3. Bundled font — Inter (SIL OFL 1.1)

Brand Studio ships the Inter typeface so that designs render identically on
every machine, whether or not the user has Inter installed. Without a bundled
font, text would silently fall back to a system face and a design created on
one computer would look different on another.

- **Files:** `src/renderer/src/assets/fonts/inter/Inter-{Regular,Bold,Italic,BoldItalic}.woff2`
- **Source:** official release v4.1 of <https://github.com/rsms/inter>
- **Copyright:** © 2016 The Inter Project Authors (https://github.com/rsms/inter)
- **License:** SIL Open Font License, Version 1.1 — full text bundled alongside
  the fonts as `OFL.txt`. The OFL is compatible with this project's GPLv3: the
  fonts are distributed unmodified, under their own terms, and are not
  relicensed.

---

## 4. JavaScript / TypeScript dependencies (Electron app, `dependencies`)

Runtime dependencies bundled into the packaged app (from `package.json`).
Build-only `devDependencies` (TypeScript, ESLint, Vite, Vitest, Electron
itself, etc.) are not redistributed inside the app and are omitted.

| Package | License | Notes |
|---|---|---|
| `@electron-toolkit/preload` | MIT | |
| `@electron-toolkit/utils` | MIT | |
| `better-sqlite3` | MIT | © Joshua Wise and contributors |
| `clsx` | MIT | |
| `konva` | MIT | © Eric Rowell (KineticJS), © Anton Lavrenov (Konva) |
| `lucide-react` | ISC | Icon components |
| `lucide-static` | ISC | Static icon assets |
| `pdf-lib` | MIT | © Andrew Dillon |
| `react` | MIT | © Meta Platforms, Inc. |
| `react-dom` | MIT | © Meta Platforms, Inc. |
| `react-dropzone` | MIT | |
| `react-hotkeys-hook` | MIT | |
| `react-konva` | MIT | |
| `react-router-dom` | MIT | |
| `simple-icons` | CC0-1.0 | See important trademark note below |
| `uuid` | MIT | |
| `virtua` | MIT | |
| `zod` | MIT | |
| `zundo` | MIT | |
| `zustand` | MIT | |

**Electron** itself (devDependency, used only to build/run the app — the
Electron binary/runtime shipped inside the packaged app is not a Brand
Studio dependency but the Chromium/Node runtime container) is MIT-licensed;
see <https://github.com/electron/electron/blob/main/LICENSE>. Electron
itself also embeds Chromium and other components under their own licenses;
see Electron's own third-party notices for details.

### Important note on `simple-icons` (CC0-1.0)

The **icon artwork/SVG paths** in `simple-icons` are released under CC0-1.0
(public domain dedication) by the simple-icons project. However, CC0-1.0
explicitly does **not** waive trademark rights (see the license text,
clause 4.1: "No trademark or patent rights held by Affirmer are waived,
abandoned, surrendered, licensed or otherwise affected by this document").
**The brand logos depicted by these icons remain the registered trademarks
of their respective owners** (e.g., the Instagram, TikTok, YouTube, etc.
logos). Brand Studio's use of `simple-icons` to render UI affordances (e.g.
"export for Instagram") does not grant any trademark license. Users of
Brand Studio are responsible for ensuring their own use of any brand logo
in exported content complies with that brand's trademark policy.

---

## 5. Python dependencies (PyInstaller-frozen sidecar)

The Python backend (`backend/`) is frozen into a standalone executable with
PyInstaller and shipped as `extraResources` (`sidecar/brandstudio-sidecar`).
Its direct dependencies, from `backend/requirements.txt`:

| Package | License | Notes |
|---|---|---|
| `fastapi` | MIT | © Sebastián Ramírez |
| `uvicorn` | BSD-3-Clause | ASGI server |
| `python-multipart` | Apache-2.0 | multipart/form-data parsing |
| `rembg` | MIT | © Daniel Gatis. Wraps the ONNX models listed in §2 above — rembg's MIT license covers rembg's own code only, **not** the model weights it loads (see §2). |
| `onnxruntime` | MIT | © Microsoft Corporation |
| `Pillow` | MIT-CMU (the "Pillow License", based on the historical CMU/ HPND-style license) | Image processing |
| `numpy` | BSD-3-Clause (with bundled components under 0BSD, MIT, Zlib, CC0-1.0) | Numerical computing |
| `opencv-python-headless` | Apache-2.0 | Also bundles the underlying OpenCV library, itself Apache-2.0 |

Each of these packages may itself bundle further third-party components
under their own licenses (notably `numpy` and `opencv-python-headless`,
which vendor several small BSD/MIT/zlib-licensed pieces); consult each
package's own `dist-info` / `LICENSE` files for full details.

Python itself (the interpreter embedded by PyInstaller into the frozen
sidecar) is licensed under the Python Software Foundation License
(PSF License, a permissive BSD-style license); see
<https://docs.python.org/3/license.html>. PyInstaller (build-time tool, not
itself redistributed as a library inside the frozen output beyond its
bootloader) is GPL-licensed but with an explicit exception permitting
proprietary/differently-licensed applications to be frozen with it — see
<https://github.com/pyinstaller/pyinstaller/blob/develop/COPYING.txt>. This
does not affect Brand Studio's own license (already GPLv3, see `LICENSE`).

---

## 6. How to obtain source code

Brand Studio's own source is available in this repository. For FFmpeg's
corresponding source specifically, see the written offer in §1 above.
