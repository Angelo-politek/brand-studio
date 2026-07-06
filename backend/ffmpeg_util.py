"""Locate the FFmpeg binaries.

In a packaged install the Electron main process points BS_FFMPEG/BS_FFPROBE at
the bundled executables; in dev they fall back to whatever is on PATH.
"""

import os
import shutil


def ffmpeg_path() -> str:
    return os.environ.get("BS_FFMPEG") or "ffmpeg"


def ffprobe_path() -> str:
    return os.environ.get("BS_FFPROBE") or "ffprobe"


def ffmpeg_available() -> bool:
    p = ffmpeg_path()
    return os.path.isfile(p) or shutil.which(p) is not None
