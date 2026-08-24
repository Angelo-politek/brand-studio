"""Pure-logic tests for backend/routers/video.py — no ffmpeg execution.

Covers filter-string construction, duration/progress math, and the in-memory
job registry. Anything that shells out to ffmpeg (_run, _render_scene,
_xfade_concat, _export_worker) is out of scope here — see the task notes
for why that's an accepted coverage gap in this pass.
"""

import time

import pytest


@pytest.fixture()
def video_module(data_root):
    import routers.video as video

    return video


class TestLookFilter:
    def test_known_looks_return_expected_filter_strings(self, video_module):
        assert video_module._look_filter("bw") == "hue=s=0"
        assert "saturation=1.4" in video_module._look_filter("warm")
        assert "contrast=1.35" in video_module._look_filter("contrast")

    def test_none_and_unknown_and_empty_return_empty_string(self, video_module):
        assert video_module._look_filter("none") == ""
        assert video_module._look_filter("") == ""
        assert video_module._look_filter("totally-unknown-look") == ""
        assert video_module._look_filter(None) == ""


class TestHex:
    def test_adds_missing_hash(self, video_module):
        assert video_module._hex("ff0000") == "#ff0000"

    def test_keeps_existing_hash(self, video_module):
        assert video_module._hex("#00ff00") == "#00ff00"

    def test_none_or_empty_defaults_to_black(self, video_module):
        assert video_module._hex(None) == "#000000"
        assert video_module._hex("") == "#000000"

    def test_strips_whitespace(self, video_module):
        assert video_module._hex("  #abc123  ") == "#abc123"


class TestEffectiveTotal:
    def test_no_transitions_sums_durations(self, video_module):
        scenes = [{"durationMs": 1000}, {"durationMs": 2000}, {"durationMs": 3000}]
        assert video_module._effective_total(scenes, wants_xfade=False) == pytest.approx(6.0)

    def test_single_scene_ignores_xfade_flag(self, video_module):
        scenes = [{"durationMs": 1500}]
        assert video_module._effective_total(scenes, wants_xfade=True) == pytest.approx(1.5)

    def test_xfade_subtracts_default_transition_overlap(self, video_module):
        # Two 4s scenes, default 500ms transition on the second -> 4+4-0.5=7.5
        scenes = [{"durationMs": 4000}, {"durationMs": 4000}]
        total = video_module._effective_total(scenes, wants_xfade=True)
        assert total == pytest.approx(7.5)

    def test_xfade_transition_clamped_to_shorter_neighbor(self, video_module):
        # transition duration is clamped to min(requested, dur[i]-0.05, dur[i-1]-0.05)
        scenes = [{"durationMs": 4000}, {"durationMs": 300, "transitionIn": {"durationMs": 5000}}]
        total = video_module._effective_total(scenes, wants_xfade=True)
        durs = [4.0, 0.3]
        tdur = min(5.0, durs[1] - 0.05, durs[0] - 0.05)
        assert total == pytest.approx(sum(durs) - tdur)

    def test_minimum_scene_duration_floor(self, video_module):
        # An explicit durationMs of 0 is floored to 0.2s, so a degenerate scene
        # still produces a renderable segment instead of a zero-length one.
        assert video_module._effective_total(
            [{"durationMs": 0}, {"durationMs": 0}], wants_xfade=False
        ) == pytest.approx(0.4)

    def test_missing_duration_uses_the_four_second_default(self, video_module):
        # A *missing* durationMs is a different case from an explicit 0: it takes
        # the 4s default rather than the floor.
        assert video_module._effective_total(
            [{"durationMs": 0}, {}], wants_xfade=False
        ) == pytest.approx(4.2)


class TestJobRegistry:
    def test_new_job_has_running_state_and_zero_progress(self, video_module):
        job = video_module._Job()
        snap = job.snapshot()
        assert snap["state"] == "running"
        assert snap["progress"] == 0.0
        assert snap["stage"] == "prepare"
        assert snap["error"] is None
        assert snap["output_path"] is None
        assert len(job.id) == 32  # uuid4().hex

    def test_register_and_get_job_roundtrip(self, video_module):
        job = video_module._Job()
        video_module._register_job(job)
        fetched = video_module._get_job(job.id)
        assert fetched is job

    def test_get_unknown_job_raises_404(self, video_module):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            video_module._get_job("does-not-exist")
        assert exc.value.status_code == 404

    def test_register_job_prunes_old_finished_jobs(self, video_module):
        old_done = video_module._Job()
        old_done.state = "done"
        old_done.created = time.time() - 7200  # 2h old, past the 1h cutoff
        video_module._jobs[old_done.id] = old_done

        old_running = video_module._Job()
        old_running.state = "running"
        old_running.created = time.time() - 7200
        video_module._jobs[old_running.id] = old_running

        new_job = video_module._Job()
        video_module._register_job(new_job)

        assert old_done.id not in video_module._jobs  # pruned: finished + stale
        assert old_running.id in video_module._jobs   # still running: kept regardless of age
        assert new_job.id in video_module._jobs

    def test_snapshot_rounds_progress(self, video_module):
        job = video_module._Job()
        job.progress = 0.123456789
        assert job.snapshot()["progress"] == 0.1235
