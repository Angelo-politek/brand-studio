# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the frozen Brand Studio sidecar.

Build with scripts/build-sidecar.ps1. Produces a self-contained --onedir
bundle (no system Python needed) that the packaged Electron app spawns.
The .onnx models stay OUTSIDE the bundle (resources/backend/models, pointed
at via U2NET_HOME) so the exe stays rebuildable without re-shipping ~170 MB
of weights per model.

scipy/scikit-image/numba/llvmlite are NOT excluded, even though this repo
went looking for that win: rembg/bg.py (imported for every /bg-remove call,
not just alpha_matting=True ones) does unconditional top-level imports of
`scipy.ndimage`, `skimage.morphology` and pymatting (which itself imports
`numba` at module scope in several submodules). Excluding any of the four
breaks `import rembg` entirely — see backend/routers/bg_remove.py's
docstring for the runtime-side defensive fallback this implies.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
# uvicorn picks loop/protocol implementations at runtime via string imports.
hiddenimports = collect_submodules("uvicorn")

# rembg resolves sessions dynamically; onnxruntime ships DLLs + capi data;
# pymatting (rembg dep) reads its own package metadata at import time.
for pkg in ("rembg", "onnxruntime", "pymatting"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    # tkinter/matplotlib/IPython/Qt: dev-only deps pulled in transitively by
    # scipy/skimage/numba but never imported by this app's code paths.
    # scipy/skimage/numba/llvmlite themselves are NOT excluded — see the
    # module docstring above.
    excludes=["tkinter", "matplotlib", "IPython", "PyQt5", "PySide2", "PySide6"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="brandstudio-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="brandstudio-sidecar",
)
