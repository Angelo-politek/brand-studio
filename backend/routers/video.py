"""Timeline video export via FFmpeg.

Renders each scene to an intermediate MP4 (background clip or solid color +
overlay PNG + per-clip audio), then concatenates the scenes (with optional
xfade transitions) and mixes a global background-music track.

Request: multipart form with
  - payload: JSON string (see _Payload below)
  - overlay_<i>: optional PNG file for scene i's overlays
"""

import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter()


def _allowed_roots() -> list[str]:
    """Directories the sidecar is permitted to read from / write to.

    Populated by the Electron main process via BS_DATA_ROOT. Empty means the
    sidecar was launched outside the app — refuse all path I/O in that case.
    """
    root = os.environ.get("BS_DATA_ROOT", "")
    return [os.path.realpath(root)] if root else []


def _safe_path(p: str) -> str:
    """Resolve `p` and ensure it stays within an allowed root.

    Guards against path traversal / arbitrary file read/write driven by the
    request payload (output_path, clip src, audio path).
    """
    if not p:
        raise HTTPException(status_code=400, detail="empty path")
    roots = _allowed_roots()
    if not roots:
        raise HTTPException(status_code=400, detail="no allowed roots configured")
    real = os.path.realpath(p)
    for root in roots:
        try:
            if os.path.commonpath([real, root]) == root:
                return real
        except ValueError:
            # Different drive (Windows) — not under this root.
            continue
    raise HTTPException(status_code=400, detail="path outside allowed roots")


def _look_filter(look: str) -> str:
    filters = {
        "none": "",
        "warm": "eq=brightness=0.05:saturation=1.4",
        "cool": "hue=s=0.85,eq=brightness=0.02",
        "bw": "hue=s=0",
        "contrast": "eq=contrast=1.35:brightness=-0.05",
        "brand": "eq=saturation=1.6:contrast=1.1",
    }
    return filters.get(look or "none", "")


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        # Persist the full failing command + stderr next to the data root so the
        # exact failure can be inspected after the fact.
        try:
            roots = _allowed_roots()
            if roots:
                # One file per failure so concurrent exports don't clobber
                # each other's diagnostics.
                log_dir = os.path.join(roots[0], "logs")
                os.makedirs(log_dir, exist_ok=True)
                stamp = time.strftime("%Y%m%d-%H%M%S")
                log = os.path.join(log_dir, f"video_export_error_{stamp}_{uuid.uuid4().hex[:8]}.log")
                with open(log, "w", encoding="utf-8") as f:
                    f.write("COMMAND:\n" + " ".join(cmd) + "\n\nSTDERR:\n" + result.stderr)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"ffmpeg failed: {result.stderr[-1500:]}")


def _hex(c: str) -> str:
    c = (c or "#000000").strip()
    return c if c.startswith("#") else f"#{c}"


def _render_scene(
    scene: dict, idx: int, w: int, h: int, overlay_path: Optional[str], out_path: str,
    frames_dir: Optional[str] = None, overlay_fps: int = 15
) -> None:
    """Render a single scene to out_path (MP4, H.264 + AAC).

    Layout: solid color background (input 0) + the clip composited at its
    box position/size (input 1, optional) + overlay (input 2, optional) which is
    either a static PNG or an animated PNG frame sequence (frames_dir).
    """
    dur = max(0.2, scene.get("durationMs", 4000) / 1000.0)
    clip = scene.get("clip")
    has_clip = bool(clip and clip.get("src"))
    has_overlay = overlay_path is not None or frames_dir is not None
    bg = _hex(scene.get("background") or "#000000")

    cmd = ["ffmpeg", "-y"]
    # Input 0: background color source.
    cmd += ["-f", "lavfi", "-i", f"color=c={bg}:s={w}x{h}:d={dur}:r=30"]

    clip_idx = None
    overlay_idx = None
    next_idx = 1
    if has_clip:
        clip_in = clip.get("inMs", 0) / 1000.0
        clip_out = clip.get("outMs", 0) / 1000.0
        cmd += ["-ss", str(clip_in)]
        # Bound the input to the trimmed length, otherwise the trim-out point
        # only holds while the scene duration happens to match it.
        if clip_out > clip_in:
            cmd += ["-t", str(clip_out - clip_in)]
        cmd += ["-i", _safe_path(clip["src"])]
        clip_idx = next_idx
        next_idx += 1
    if frames_dir is not None:
        # Animated overlay: image sequence at overlay_fps. Loop the sequence and
        # cap it to the scene duration so it always covers the whole scene
        # without running past it.
        cmd += [
            "-framerate", str(overlay_fps),
            "-stream_loop", "-1",
            "-t", str(dur),
            "-i", os.path.join(frames_dir, "f_%05d.png"),
        ]
        overlay_idx = next_idx
        next_idx += 1
    elif overlay_path is not None:
        # Static overlay: a single looped frame, bounded to the scene duration.
        # Without -t the looped image is an infinite input, which makes the
        # overlay filtergraph buffer forever (OOM / hang) instead of ending.
        cmd += ["-loop", "1", "-t", str(dur), "-i", overlay_path]
        overlay_idx = next_idx
        next_idx += 1

    # Silent-audio input, when there is no clip audio to use. It MUST be declared
    # here alongside the other inputs — declaring an -i after the output's
    # -filter_complex/-map options makes ffmpeg reject the command.
    use_clip_audio = has_clip and not clip.get("muted", False)
    silent_audio_idx = None
    if not use_clip_audio:
        cmd += ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        silent_audio_idx = next_idx
        next_idx += 1

    steps: list[str] = []
    base = "0:v"

    if has_clip:
        bx = int(round(clip.get("x", 0)))
        by = int(round(clip.get("y", 0)))
        bw = max(1, int(round(clip.get("width", w))))
        bh = max(1, int(round(clip.get("height", h))))
        crop = clip.get("crop")
        cur = f"{clip_idx}:v"
        # Apply source crop first (in source pixels).
        if crop and clip.get("naturalWidth") and clip.get("naturalHeight"):
            cx = max(0, int(round(crop["x"])))
            cy = max(0, int(round(crop["y"])))
            cw = max(1, int(round(crop["width"])))
            ch = max(1, int(round(crop["height"])))
            steps.append(f"[{cur}]crop={cw}:{ch}:{cx}:{cy}[cc]")
            cur = "cc"
        # Fit into the box.
        if clip.get("fit") == "contain":
            steps.append(
                f"[{cur}]scale={bw}:{bh}:force_original_aspect_ratio=decrease,"
                f"pad={bw}:{bh}:(ow-iw)/2:(oh-ih)/2:color=black@0[cf]"
            )
        else:
            steps.append(
                f"[{cur}]scale={bw}:{bh}:force_original_aspect_ratio=increase,crop={bw}:{bh}[cf]"
            )
        cur = "cf"
        look_f = _look_filter(clip.get("look", "none"))
        if look_f:
            steps.append(f"[{cur}]{look_f}[cl]")
            cur = "cl"
        # Composite the clip box onto the background. eof_action=pass keeps the
        # background flowing if the clip ends first; the output -t bounds length.
        steps.append(f"[{base}][{cur}]overlay={bx}:{by}:eof_action=pass[bgc]")
        base = "bgc"

    if has_overlay:
        steps.append(f"[{base}][{overlay_idx}:v]overlay=0:0:eof_action=pass[vout]")
        base = "vout"
    else:
        steps.append(f"[{base}]null[vout]")
        base = "vout"

    cmd += ["-filter_complex", ";".join(steps), "-map", "[vout]"]

    # Audio: from the clip (respecting mute/volume) or the silent source declared
    # with the inputs above.
    if use_clip_audio:
        vol = float(clip.get("volume", 1.0))
        cmd += ["-map", f"{clip_idx}:a?", "-af", f"volume={vol}"]
    else:
        cmd += ["-map", f"{silent_audio_idx}:a"]

    cmd += [
        "-t", str(dur),
        "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-r", "30",
        out_path,
    ]
    _run(cmd)


@router.post("/video/export")
async def export_video(request: Request) -> JSONResponse:
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=503, detail="ffmpeg not found in PATH")

    form = await request.form()
    payload = form.get("payload")
    if not payload:
        raise HTTPException(status_code=400, detail="missing payload")
    data = json.loads(payload)
    w = int(data["width"])
    h = int(data["height"])
    scenes = data.get("scenes", [])
    # Validate all caller-supplied paths against the allowed roots before any I/O.
    output_path = _safe_path(data["outputPath"])
    audio = data.get("audio")  # { path, volume } or None
    if audio and audio.get("path"):
        audio = {**audio, "path": _safe_path(audio["path"])}
    overlay_fps = int(data.get("overlayFps", 15))
    if not scenes:
        raise HTTPException(status_code=400, detail="no scenes")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="bs_video_")
    written: list[str] = []
    try:
        # 1) Render each scene to its own MP4.
        seg_paths: list[str] = []
        for i, scene in enumerate(scenes):
            ov_path = None       # single static overlay PNG
            frames_dir = None    # directory of animated overlay frames

            # Animated overlay frames: fields frames_<i>_<j>.
            frame_keys = sorted(
                [k for k in form.keys() if k.startswith(f"frames_{i}_")],
                key=lambda k: int(k.rsplit("_", 1)[1])
            )
            if frame_keys:
                frames_dir = os.path.join(tmpdir, f"frames_{i}")
                os.makedirs(frames_dir, exist_ok=True)
                for j, key in enumerate(frame_keys):
                    fp = os.path.join(frames_dir, f"f_{j:05d}.png")
                    with open(fp, "wb") as f:
                        f.write(await form[key].read())
                    written.append(fp)
            else:
                up = form.get(f"overlay_{i}")
                if up is not None and getattr(up, "filename", None):
                    ov_path = os.path.join(tmpdir, f"ov_{i}.png")
                    with open(ov_path, "wb") as f:
                        f.write(await up.read())
                    written.append(ov_path)

            seg = os.path.join(tmpdir, f"seg_{i}.mp4")
            _render_scene(scene, i, w, h, ov_path, seg, frames_dir, overlay_fps)
            seg_paths.append(seg)
            written.append(seg)

        # 2) Concatenate scenes. Use xfade when any scene requests a transition;
        #    otherwise the fast concat demuxer.
        wants_xfade = any(
            (s.get("transitionIn") or {}).get("type", "none") not in ("none", None)
            for s in scenes[1:]
        )
        concat_path = os.path.join(tmpdir, "concat.mp4")
        written.append(concat_path)

        if len(seg_paths) == 1:
            shutil.copyfile(seg_paths[0], concat_path)
        elif not wants_xfade:
            listfile = os.path.join(tmpdir, "list.txt")
            with open(listfile, "w") as f:
                for p in seg_paths:
                    f.write(f"file '{p}'\n")
            written.append(listfile)
            _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
                  "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
                  "-c:a", "aac", "-b:a", "128k", concat_path])
        else:
            _xfade_concat(scenes, seg_paths, concat_path)

        # 3) Mix global background music, if any.
        if audio and audio.get("path"):
            avol = float(audio.get("volume", 0.8))
            ain = float(audio.get("inMs", 0)) / 1000.0
            _run([
                "ffmpeg", "-y",
                "-i", concat_path,
                "-ss", str(ain), "-i", audio["path"],
                "-filter_complex",
                f"[1:a]volume={avol}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]",
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                "-movflags", "+faststart",
                output_path,
            ])
        else:
            _run(["ffmpeg", "-y", "-i", concat_path, "-c", "copy",
                  "-movflags", "+faststart", output_path])

    finally:
        for p in written:
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass

    return JSONResponse({"output_path": output_path})


def _xfade_concat(scenes: list[dict], seg_paths: list[str], out_path: str) -> None:
    """Chain segments with xfade (video) + acrossfade (audio)."""
    inputs: list[str] = []
    for p in seg_paths:
        inputs += ["-i", p]

    # Build progressive xfade chain. Need each segment's duration.
    durs = [max(0.2, s.get("durationMs", 4000) / 1000.0) for s in scenes]
    steps: list[str] = []
    vcur = "0:v"
    acur = "0:a"
    elapsed = durs[0]
    xfade_map = {"fade": "fade", "slideLeft": "slideleft", "slideUp": "slideup"}
    for i in range(1, len(seg_paths)):
        tr = scenes[i].get("transitionIn") or {}
        ttype = xfade_map.get(tr.get("type", "fade"), "fade")
        tdur = max(0.1, min(float(tr.get("durationMs", 500)) / 1000.0, durs[i] - 0.05, durs[i - 1] - 0.05))
        offset = max(0.0, elapsed - tdur)
        vout = f"vx{i}"
        aout = f"ax{i}"
        steps.append(f"[{vcur}][{i}:v]xfade=transition={ttype}:duration={tdur}:offset={offset}[{vout}]")
        steps.append(f"[{acur}][{i}:a]acrossfade=d={tdur}[{aout}]")
        vcur, acur = vout, aout
        elapsed = elapsed + durs[i] - tdur

    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(steps),
        "-map", f"[{vcur}]", "-map", f"[{acur}]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        out_path,
    ])
