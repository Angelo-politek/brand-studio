# Background-removal models

`U2NET_HOME` points here (set by the Electron sidecar manager and the setup
script). On first background removal, rembg loads `u2net.onnx` from this folder.

`setup_venv.ps1` / `setup_venv.sh` pre-download the model here so the app works
fully offline afterwards. If you skip that step, rembg will attempt a one-time
download on the first `/bg-remove` call (requires network access once).
