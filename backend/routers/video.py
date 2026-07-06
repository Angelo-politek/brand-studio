"""Timeline video export via FFmpeg — job-based with progress and cancellation.

POST /video/export starts a background job and returns {"job_id"} immediately.
The renderer pre-writes overlay PNGs / frame sequences under the data root
(cache/video-export/<id>/…) and sends only JSON; the job composites each scene
(background color + clip + overlay + audio), concatenates (stream copy, or
xfade re-encode when transitions are requested) and mixes the music track.

GET  /video/jobs/{id}         -> {state, progress, stage, error, output_path}
POST /video/jobs/{id}/cancel  -> kills the running ffmpeg and marks cancelled
"""

import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ffmpeg_util import ffmpeg_available, ffmpeg_path

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


def _export_work_root() -> str:
    """The only tree whose directories this router will recursively delete."""
    roots = _allowed_roots()
    if not roots:
        raise HTTPException(status_code=400, detail="no allowed roots configured")
    return os.path.join(roots[0], "cache", "video-export")


def _safe_work_path(p: str) -> str:
    """Like _safe_path, but additionally confined to cache/video-export."""
    real = _safe_path(p)
    work_root = os.path.realpath(_export_work_root())
    try:
        if os.path.commonpath([real, work_root]) == work_root and real != work_root:
            return real
    except ValueError:
        pass
    raise HTTPException(status_code=400, detail="path outside export work dir")


def _look_filter(look: str) -> str:
    filters = {
        "warm": "eq=brightness=0.05:saturation=1.4",
        "cool": "hue=s=0.85,eq=brightness=0.02",
        "bw": "hue=s=0",
        "contrast": "eq=contrast=1.35:brightness=-0.05",
        "brand": "eq=saturation=1.6:contrast=1.1",
    }
    return filters.get(look or "none", "")


def _hex(c: str) -> str:
    c = (c or "#000000").strip()
    return c if c.startswith("#") else f"#{c}"


# ------------------------------- job registry ------------------------------

class _JobCancelled(Exception):
    pass


class _Job:
    def __init__(self) -> None:
        self.id = uuid.uuid4().hex
        self.state = "running"  # running | done | error | cancelled
        self.progress = 0.0     # 0..1
        self.stage = "prepare"
        self.error: Optional[str] = None
        self.output_path: Optional[str] = None
        self.cancel = threading.Event()
        self.proc: Optional[subprocess.Popen] = None
        self.created = time.time()

    def snapshot(self) -> dict:
        return {
            "job_id": self.id,
            "state": self.state,
            "progress": round(self.progress, 4),
            "stage": self.stage,
            "error": self.error,
            "output_path": self.output_path,
        }


_jobs: dict[str, _Job] = {}
_jobs_lock = threading.Lock()


def _register_job(job: _Job) -> None:
    with _jobs_lock:
        # Prune finished jobs older than an hour so the registry stays small.
        cutoff = time.time() - 3600
        for jid in [j for j, v in _jobs.items() if v.state != "running" and v.created < cutoff]:
            del _jobs[jid]
        _jobs[job.id] = job


def _get_job(job_id: str) -> _Job:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    return job


# ------------------------------ ffmpeg runner ------------------------------

def _write_error_log(cmd: list[str], stderr: str) -> None:
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
                f.write("COMMAND:\n" + " ".join(cmd) + "\n\nSTDERR:\n" + stderr)
    except OSError:
        pass


def _run(
    cmd: list[str],
    job: Optional[_Job] = None,
    span: tuple[float, float] = (0.0, 0.0),
    expected_dur: Optional[float] = None,
    timeout: float = 600.0,
) -> None:
    """Run an ffmpeg command, streaming -progress into job.progress over `span`.

    Honors job.cancel (kills the process and raises _JobCancelled).
    """
    full = [cmd[0], "-nostats", "-progress", "pipe:1", *cmd[1:]]
    proc = subprocess.Popen(
        full,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if job is not None:
        job.proc = proc

    stderr_chunks: list[str] = []

    def _drain_stderr() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            stderr_chunks.append(line)

    t = threading.Thread(target=_drain_stderr, daemon=True)
    t.start()

    deadline = time.time() + timeout
    cancelled = False
    assert proc.stdout is not None
    for line in proc.stdout:
        if job is not None and job.cancel.is_set():
            cancelled = True
            proc.kill()
            break
        if time.time() > deadline:
            proc.kill()
            proc.wait()
            raise RuntimeError("ffmpeg timed out")
        if job is not None and expected_dur and line.startswith("out_time_us="):
            try:
                t_sec = int(line.split("=", 1)[1]) / 1_000_000.0
            except ValueError:
                continue
            frac = max(0.0, min(1.0, t_sec / expected_dur))
            job.progress = span[0] + frac * (span[1] - span[0])

    proc.wait()
    t.join(timeout=5)
    if job is not None:
        job.proc = None
        if cancelled or job.cancel.is_set():
            raise _JobCancelled()
    if proc.returncode != 0:
        stderr = "".join(stderr_chunks)
        _write_error_log(full, stderr)
        raise RuntimeError(f"ffmpeg failed: {stderr[-1500:]}")
    if job is not None:
        job.progress = span[1]


# ------------------------------ scene renderer -----------------------------

def _render_scene(
    scene: dict, idx: int, w: int, h: int, out_path: str,
    overlay_fps: int = 30,
    job: Optional[_Job] = None,
    span: tuple[float, float] = (0.0, 0.0),
) -> None:
    """Render a single scene to out_path (MP4, H.264 + AAC).

    Layout: solid color background (input 0) + the clip composited at its
    box position/size (input 1, optional) + overlay (input 2, optional) which is
    either a static PNG (scene.overlayPath) or an animated PNG frame sequence
    (scene.framesDir), both pre-written by the renderer under the data root.
    """
    dur = max(0.2, scene.get("durationMs", 4000) / 1000.0)
    clip = scene.get("clip")
    has_clip = bool(clip and clip.get("src"))
    overlay_path = scene.get("overlayPath") or None
    frames_dir = scene.get("framesDir") or None
    has_overlay = overlay_path is not None or frames_dir is not None
    bg = _hex(scene.get("background") or "#000000")

    cmd = [ffmpeg_path(), "-y"]
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
        cmd += ["-i", clip["src"]]
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
    _run(cmd, job=job, span=span, expected_dur=dur)


def _xfade_concat(
    scenes: list[dict], seg_paths: list[str], out_path: str,
    job: Optional[_Job] = None, span: tuple[float, float] = (0.0, 0.0),
) -> None:
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
        ffmpeg_path(), "-y", *inputs,
        "-filter_complex", ";".join(steps),
        "-map", f"[{vcur}]", "-map", f"[{acur}]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        out_path,
    ], job=job, span=span, expected_dur=sum(durs))


# ------------------------------- export job --------------------------------

# Progress spans per pipeline stage (renderer rasterization happens before the
# POST, so the whole 0..1 here is backend work).
_SPAN_RENDER = (0.0, 0.75)
_SPAN_CONCAT = (0.75, 0.92)
_SPAN_MUX = (0.92, 1.0)


def _export_worker(data: dict, job: _Job) -> None:
    w = int(data["width"])
    h = int(data["height"])
    scenes = data["scenes"]
    output_path = data["outputPath"]
    audio = data.get("audio")
    overlay_fps = int(data.get("overlayFps", 30))
    work_dir = data.get("workDir")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="bs_video_")
    written: list[str] = []
    try:
        # 1) Render each scene to its own MP4, progress-weighted by duration.
        total_dur = sum(max(0.2, s.get("durationMs", 4000) / 1000.0) for s in scenes)
        seg_paths: list[str] = []
        acc = 0.0
        for i, scene in enumerate(scenes):
            if job.cancel.is_set():
                raise _JobCancelled()
            job.stage = f"scene {i + 1}/{len(scenes)}"
            sdur = max(0.2, scene.get("durationMs", 4000) / 1000.0)
            lo = _SPAN_RENDER[0] + (acc / total_dur) * (_SPAN_RENDER[1] - _SPAN_RENDER[0])
            hi = _SPAN_RENDER[0] + ((acc + sdur) / total_dur) * (_SPAN_RENDER[1] - _SPAN_RENDER[0])
            acc += sdur
            seg = os.path.join(tmpdir, f"seg_{i}.mp4")
            _render_scene(scene, i, w, h, seg, overlay_fps, job=job, span=(lo, hi))
            seg_paths.append(seg)
            written.append(seg)

        # 2) Concatenate scenes. Use xfade when any scene requests a transition;
        #    otherwise the concat demuxer with stream copy (segments share the
        #    same encoder settings, so no generation loss and near-instant).
        wants_xfade = any(
            (s.get("transitionIn") or {}).get("type", "none") not in ("none", None)
            for s in scenes[1:]
        )
        concat_path = os.path.join(tmpdir, "concat.mp4")
        written.append(concat_path)
        job.stage = "concat"

        if len(seg_paths) == 1:
            shutil.copyfile(seg_paths[0], concat_path)
            job.progress = _SPAN_CONCAT[1]
        elif not wants_xfade:
            listfile = os.path.join(tmpdir, "list.txt")
            with open(listfile, "w") as f:
                for p in seg_paths:
                    f.write(f"file '{p}'\n")
            written.append(listfile)
            _run([ffmpeg_path(), "-y", "-f", "concat", "-safe", "0", "-i", listfile,
                  "-c", "copy", concat_path],
                 job=job, span=_SPAN_CONCAT, expected_dur=total_dur)
        else:
            _xfade_concat(scenes, seg_paths, concat_path, job=job, span=_SPAN_CONCAT)

        # 3) Mix global background music, if any.
        job.stage = "audio"
        if audio and audio.get("path"):
            avol = float(audio.get("volume", 0.8))
            ain = float(audio.get("inMs", 0)) / 1000.0
            _run([
                ffmpeg_path(), "-y",
                "-i", concat_path,
                "-ss", str(ain), "-i", audio["path"],
                "-filter_complex",
                f"[1:a]volume={avol}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]",
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                "-movflags", "+faststart",
                output_path,
            ], job=job, span=_SPAN_MUX, expected_dur=total_dur)
        else:
            _run([ffmpeg_path(), "-y", "-i", concat_path, "-c", "copy",
                  "-movflags", "+faststart", output_path],
                 job=job, span=_SPAN_MUX, expected_dur=total_dur)

        job.progress = 1.0
        job.stage = "done"
        job.output_path = output_path
        job.state = "done"

    except _JobCancelled:
        job.state = "cancelled"
        job.stage = "cancelled"
        try:
            if os.path.exists(output_path):
                os.unlink(output_path)
        except OSError:
            pass
    except Exception as exc:  # noqa: BLE001 — surfaced via the job status
        job.state = "error"
        job.stage = "error"
        job.error = str(exc)[:2000]
    finally:
        for p in written:
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass
        shutil.rmtree(tmpdir, ignore_errors=True)
        # The renderer-written overlays/frames live in a per-export dir under
        # cache/video-export (validated at request time) — clean it up here.
        if work_dir:
            shutil.rmtree(work_dir, ignore_errors=True)


def _prune_stale_work_dirs() -> None:
    """Remove export work dirs older than a day (orphans from crashed exports)."""
    try:
        root = _export_work_root()
        if not os.path.isdir(root):
            return
        cutoff = time.time() - 86400
        for name in os.listdir(root):
            p = os.path.join(root, name)
            try:
                if os.path.getmtime(p) < cutoff:
                    shutil.rmtree(p, ignore_errors=True)
            except OSError:
                continue
    except HTTPException:
        pass


# --------------------------------- routes ----------------------------------

@router.post("/video/export")
async def export_video(payload: dict) -> JSONResponse:
    if not ffmpeg_available():
        raise HTTPException(status_code=503, detail="ffmpeg not available")

    data = dict(payload)
    try:
        int(data["width"])
        int(data["height"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="invalid width/height")
    scenes = data.get("scenes") or []
    if not scenes:
        raise HTTPException(status_code=400, detail="no scenes")

    # Validate every caller-supplied path before the job thread starts, so bad
    # requests fail fast with 400 and the worker only ever sees safe paths.
    data["outputPath"] = _safe_path(data["outputPath"])
    audio = data.get("audio")
    if audio and audio.get("path"):
        data["audio"] = {**audio, "path": _safe_path(audio["path"])}
    if data.get("workDir"):
        data["workDir"] = _safe_work_path(data["workDir"])
    for scene in scenes:
        clip = scene.get("clip")
        if clip and clip.get("src"):
            clip["src"] = _safe_path(clip["src"])
        if scene.get("overlayPath"):
            scene["overlayPath"] = _safe_work_path(scene["overlayPath"])
        if scene.get("framesDir"):
            scene["framesDir"] = _safe_work_path(scene["framesDir"])

    _prune_stale_work_dirs()

    job = _Job()
    _register_job(job)
    threading.Thread(target=_export_worker, args=(data, job), daemon=True).start()
    return JSONResponse(job.snapshot(), status_code=202)


@router.get("/video/jobs/{job_id}")
async def job_status(job_id: str) -> JSONResponse:
    return JSONResponse(_get_job(job_id).snapshot())


@router.post("/video/jobs/{job_id}/cancel")
async def job_cancel(job_id: str) -> JSONResponse:
    job = _get_job(job_id)
    job.cancel.set()
    proc = job.proc
    if proc is not None:
        try:
            proc.kill()
        except OSError:
            pass
    return JSONResponse(job.snapshot())
