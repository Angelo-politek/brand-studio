"""Locate the FFmpeg binary.

In a packaged install the Electron main process points BS_FFMPEG at the
bundled executable; in dev it falls back to whatever is on PATH.
"""

import os
import shutil


def ffmpeg_path() -> str:
    return os.environ.get("BS_FFMPEG") or "ffmpeg"


def ffmpeg_available() -> bool:
    p = ffmpeg_path()
    return os.path.isfile(p) or shutil.which(p) is not None
