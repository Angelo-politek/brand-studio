"""Tests for backend/routers/video.py's path-confinement helpers.

_safe_path is the second half of the sidecar's security boundary (the token
middleware is the first): it's what stops a compromised/malicious renderer
payload from reading or writing files outside BS_DATA_ROOT via output_path,
clip src, or the audio path in a /video/export request body.

All paths are built with tmp_path / os.path.join so this passes on Linux CI
(no Windows-specific path literals).
"""

import os

import pytest
from fastapi import HTTPException


@pytest.fixture()
def video_module(data_root, monkeypatch):
    """Import routers.video with BS_DATA_ROOT already pointed at a temp dir
    (the data_root fixture sets the env var). _allowed_roots() re-reads the
    env var on every call, so no reload is required — but we import lazily
    here (after the fixture ran) to keep that dependency explicit."""
    import importlib

    import routers.video as video

    importlib.reload(video)  # ensure a clean module if another test order changed env first
    return video


class TestAllowedRoots:
    def test_no_data_root_configured_means_no_allowed_roots(self, monkeypatch, video_module):
        monkeypatch.delenv("BS_DATA_ROOT", raising=False)
        assert video_module._allowed_roots() == []

    def test_data_root_configured_returns_realpath(self, video_module, data_root):
        roots = video_module._allowed_roots()
        assert roots == [os.path.realpath(str(data_root))]


class TestSafePathRejectsWhenUnconfigured:
    def test_raises_400_when_no_data_root(self, monkeypatch, video_module):
        monkeypatch.delenv("BS_DATA_ROOT", raising=False)
        with pytest.raises(HTTPException) as exc:
            video_module._safe_path("/anything")
        assert exc.value.status_code == 400

    def test_raises_400_on_empty_path(self, video_module, data_root):
        with pytest.raises(HTTPException) as exc:
            video_module._safe_path("")
        assert exc.value.status_code == 400


class TestSafePathValidCases:
    def test_root_itself_is_allowed(self, video_module, data_root):
        result = video_module._safe_path(str(data_root))
        assert result == os.path.realpath(str(data_root))

    def test_direct_child_is_allowed(self, video_module, data_root):
        target = data_root / "clip.mp4"
        result = video_module._safe_path(str(target))
        assert result == os.path.realpath(str(target))

    def test_nested_child_is_allowed(self, video_module, data_root):
        target = data_root / "cache" / "video-export" / "job1" / "seg_0.mp4"
        result = video_module._safe_path(str(target))
        assert result == os.path.realpath(str(target))

    def test_path_with_dot_segments_that_stay_inside_is_allowed(self, video_module, data_root):
        inner = data_root / "a" / "b"
        os.makedirs(str(inner), exist_ok=True)
        # a/b/../c resolves to a/c, still inside data_root.
        target = os.path.join(str(inner), "..", "c.mp4")
        result = video_module._safe_path(target)
        assert result == os.path.realpath(os.path.join(str(data_root), "a", "c.mp4"))


class TestSafePathTraversalRejected:
    def test_relative_dotdot_traversal_escapes_root(self, video_module, data_root):
        traversal = os.path.join(str(data_root), "..", "..", "etc", "passwd")
        with pytest.raises(HTTPException) as exc:
            video_module._safe_path(traversal)
        assert exc.value.status_code == 400
        assert "outside allowed roots" in exc.value.detail

    def test_windows_style_backslash_traversal_string_is_rejected_or_inert(self, video_module, data_root):
        # A literal string containing backslash-escaped traversal
        # ("..\\..\\windows\\system32") passed on a POSIX system is not
        # interpreted as path separators by os.path at all — it becomes a
        # single funny-looking filename *inside* data_root, which is exactly
        # what a correct implementation should do: not silently escape.
        # Assert one of the two safe outcomes: either it's rejected, or it
        # resolves to a path that's still confined under data_root.
        weird = os.path.join(str(data_root), "..\\..\\windows\\system32")
        try:
            result = video_module._safe_path(weird)
        except HTTPException as exc:
            assert exc.status_code == 400
        else:
            root = os.path.realpath(str(data_root))
            assert os.path.commonpath([result, root]) == root

    def test_absolute_path_outside_root_is_rejected(self, video_module, data_root):
        with pytest.raises(HTTPException) as exc:
            video_module._safe_path(os.path.join(os.path.dirname(str(data_root)), "elsewhere", "secret.txt"))
        assert exc.value.status_code == 400

    def test_root_level_absolute_path_is_rejected(self, video_module, data_root):
        # A completely unrelated absolute path, e.g. /etc/passwd on Linux.
        unrelated = os.path.abspath(os.sep + os.path.join("etc", "passwd"))
        with pytest.raises(HTTPException):
            video_module._safe_path(unrelated)

    def test_sibling_directory_sharing_a_string_prefix_is_rejected(self, video_module, tmp_path, monkeypatch):
        """Regression guard for the classic `str.startswith(root)` bug: a
        sibling directory whose NAME starts with the root's name as a string
        (but is a different directory) must NOT be treated as inside root.

        e.g. root=/data/app, sibling=/data/application-x — a naive
        `path.startswith(root)` check would wrongly accept the sibling
        because the strings share a prefix; _safe_path must use path-aware
        comparison (os.path.commonpath) and reject it.
        """
        base = tmp_path / "prefix-collision"
        root = base / "app"
        sibling = base / "application-x"
        root.mkdir(parents=True)
        sibling.mkdir(parents=True)
        monkeypatch.setenv("BS_DATA_ROOT", str(root))

        target = sibling / "secret.txt"
        with pytest.raises(HTTPException) as exc:
            video_module._safe_path(str(target))
        assert exc.value.status_code == 400
        assert "outside allowed roots" in exc.value.detail

    def test_sibling_file_sharing_a_string_prefix_is_rejected(self, video_module, tmp_path, monkeypatch):
        # Same bug class, but the collision is a sibling *file*, not just a
        # directory: root=".../app" vs a file literally named "app-evil.txt"
        # in the parent directory (string startswith would also false-accept
        # this one).
        base = tmp_path / "prefix-collision-2"
        root = base / "app"
        root.mkdir(parents=True)
        monkeypatch.setenv("BS_DATA_ROOT", str(root))

        sibling_file = base / "app-evil.txt"
        sibling_file.write_text("nope")
        with pytest.raises(HTTPException):
            video_module._safe_path(str(sibling_file))


@pytest.mark.skipif(os.name == "nt", reason="requires POSIX symlinks / os.symlink without admin privileges")
class TestSafePathSymlinks:
    def test_symlink_pointing_outside_root_is_rejected(self, video_module, tmp_path, monkeypatch):
        root = tmp_path / "root"
        root.mkdir()
        outside = tmp_path / "outside"
        outside.mkdir()
        secret = outside / "secret.txt"
        secret.write_text("top secret")

        link = root / "link.txt"
        os.symlink(str(secret), str(link))
        monkeypatch.setenv("BS_DATA_ROOT", str(root))

        with pytest.raises(HTTPException) as exc:
            video_module._safe_path(str(link))
        assert exc.value.status_code == 400

    def test_symlink_pointing_inside_root_is_allowed(self, video_module, tmp_path, monkeypatch):
        root = tmp_path / "root"
        root.mkdir()
        real_file = root / "real.txt"
        real_file.write_text("fine")
        link = root / "link.txt"
        os.symlink(str(real_file), str(link))
        monkeypatch.setenv("BS_DATA_ROOT", str(root))

        result = video_module._safe_path(str(link))
        assert result == os.path.realpath(str(real_file))


class TestSafeWorkPath:
    def test_work_root_itself_is_rejected(self, video_module, data_root):
        # _safe_work_path explicitly requires real != work_root — the export
        # work root directory itself is not a valid "file" target.
        work_root = os.path.join(str(data_root), "cache", "video-export")
        os.makedirs(work_root, exist_ok=True)
        with pytest.raises(HTTPException) as exc:
            video_module._safe_work_path(work_root)
        assert exc.value.status_code == 400

    def test_path_inside_work_root_is_allowed(self, video_module, data_root):
        target = os.path.join(str(data_root), "cache", "video-export", "job1", "overlay.png")
        result = video_module._safe_work_path(target)
        assert result == os.path.realpath(target)

    def test_path_inside_data_root_but_outside_work_root_is_rejected(self, video_module, data_root):
        # Valid under _safe_path (inside BS_DATA_ROOT) but not under the
        # tighter cache/video-export confinement _safe_work_path adds.
        target = os.path.join(str(data_root), "some-other-dir", "file.png")
        with pytest.raises(HTTPException) as exc:
            video_module._safe_work_path(target)
        assert exc.value.status_code == 400
        assert "export work dir" in exc.value.detail

    def test_traversal_out_of_work_root_is_rejected(self, video_module, data_root):
        work_root = os.path.join(str(data_root), "cache", "video-export")
        traversal = os.path.join(work_root, "..", "..", "..", "elsewhere")
        with pytest.raises(HTTPException):
            video_module._safe_work_path(traversal)


class TestExportWorkRoot:
    def test_raises_when_no_data_root(self, monkeypatch, video_module):
        monkeypatch.delenv("BS_DATA_ROOT", raising=False)
        with pytest.raises(HTTPException) as exc:
            video_module._export_work_root()
        assert exc.value.status_code == 400

    def test_returns_cache_video_export_under_root(self, video_module, data_root):
        result = video_module._export_work_root()
        assert result == os.path.join(os.path.realpath(str(data_root)), "cache", "video-export")
