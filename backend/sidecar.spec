# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the frozen Brand Studio sidecar.

Build with scripts/build-sidecar.ps1. Produces a self-contained --onedir
bundle (no system Python needed) that the packaged Electron app spawns.
The u2net.onnx model stays OUTSIDE the bundle (resources/backend/models,
pointed at via U2NET_HOME) so the exe stays rebuildable without re-shipping
176 MB of weights.
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
