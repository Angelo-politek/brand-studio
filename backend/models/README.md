# Background-removal models

`U2NET_HOME` points here (set by the Electron sidecar manager and the setup
script). rembg loads its model from this folder — two are shipped:

- `isnet-general-use.onnx` — default, used for general product/object cutouts
- `u2net_human_seg.onnx` — used when the "Person" mode is selected

The legacy `u2net.onnx` model is not shipped (superseded by `isnet-general-use`).

`setup_venv.ps1` / `setup_venv.sh` (via `ensureVenv` in
`src/main/python/setup.ts`) pre-download both models here so the app works
fully offline afterwards. If you skip that step, rembg will attempt a
one-time download on the first `/bg-remove` call for each model (requires
network access once).
