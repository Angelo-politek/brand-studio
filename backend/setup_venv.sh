#!/usr/bin/env bash
# Creates the backend virtual environment and installs dependencies.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
py="$here/.venv/bin/python"

if [ ! -x "$py" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$here/.venv"
fi

"$py" -m pip install --upgrade pip
"$py" -m pip install -r "$here/requirements.txt"

# Optional: pre-download the rembg u2net model so background removal works offline.
export U2NET_HOME="$here/models"
echo "Pre-fetching background-removal model (u2net)..."
"$py" -c "from rembg import new_session; new_session('u2net'); print('model ready')"

echo "Backend venv ready."
