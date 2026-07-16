"""Focused tests for secure chair-stand MP4 replay without real media/model assets."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import cv2
import numpy as np
import pytest

import validation.chair_stand.replay as replay_module
from app.cv.types import Landmark
from validation.chair_stand.replay import (
    ReplayCounters,
    ReplayExecution,
    ReplayTiming,
    ReplayValidationError,
    VideoMetadata,
    frame_window,
    replay_case,
    resolve_safe_video_path,
    sanitise_csv_value,
    timing_for_case,
    validate_video_file,
    validate_video_metadata,
    write_case_report,
)
from validation.chair_stand.schema import (
    CaseResult,
    DetectedOutcome,
    ExpectedOutcome,
    ExpectedValidity,
    FailureCategory,
    ProcessingStatus,
    Sex,
    SourceType,
    SubjectAnnotation,
    TimingAnnotation,
    ValidationCase,
    ViewMetadata,
    compare_outcomes,
)


FRAME = np.zeros((2, 2, 3), dtype=np.uint8)
POSE = [Landmark(0.5, 0.5, 0.0, 1.0)]


class FakeCapture:
    def __init__(
        self,
        *,
        opened: bool = True,
        fps: float = 1.0,
        frame_count: float = 37,
        width: float = 640,
        height: float = 480,
        frames: list[np.ndarray] | None = None,
        events: list[str] | None = None,
    ) -> None:
        self.opened = opened
        self.properties = {
            cv2.CAP_PROP_FPS: fps,
            cv2.CAP_PROP_FRAME_COUNT: frame_count,
            cv2.CAP_PROP_FRAME_WIDTH: width,
            cv2.CAP_PROP_FRAME_HEIGHT: height,
        }
        self.frames = list(frames if frames is not None else [FRAME] * 37)
        self.index = 0
        self.released = False
        self.events = events

    def isOpened(self) -> bool:
        return self.opened

    def get(self, property_id: int) -> object:
        return self.properties[property_id]

    def read(self) -> tuple[bool, Any]:
        if self.index >= len(self.frames):
            return False, None
        frame = self.frames[self.index]
        self.index += 1
        return True, frame

    def release(self) -> None:
        self.released = True
        if self.events is not None:
            self.events.append("capture.release")


class FakeDetector:
    def __init__(
        self,
        *,
        responses: list[Any] | None = None,
        raise_on_init: bool = False,
        raise_on_detect: bool = False,
        events: list[str] | None = None,
    ) -> None:
        self.responses = list(responses) if responses is not None else None
        self.raise_on_init = raise_on_init
        self.raise_on_detect = raise_on_detect
        self.events = events
        self.initialized = False
        self.closed = False
        self.detect_calls = 0

    def init(self) -> None:
        if self.events is not None:
            self.events.append("detector.init")
        if self.raise_on_init:
            raise RuntimeError("detector init failed")
        self.initialized = True

    def detect(self, rgb_image: Any) -> Any:
        assert rgb_image.shape == FRAME.shape
        if self.events is not None:
            self.events.append("detector.detect")
        if self.raise_on_detect:
            raise RuntimeError("detector failed")
        self.detect_calls += 1
        if self.responses is None:
            return POSE
        if self.responses:
            return self.responses.pop(0)
        return None

    def close(self) -> None:
        self.closed = True
        if self.events is not None:
            self.events.append("detector.close")


class FakeSmoother:
    def __init__(self, events: list[str] | None = None) -> None:
        self.events = events
        self.timestamps_ms: list[float] = []

    def smooth(self, landmarks: Any, timestamp_ms: float) -> Any:
        if self.events is not None:
            self.events.append("smoother.smooth")
        self.timestamps_ms.append(timestamp_ms)
        return landmarks


class FakeStrategy:
    def __init__(
        self,
        *,
        final_reps: int = 5,
        quality: float | None = 0.9,
        finish_ok: bool = True,
        min_calibration_samples: int = 3,
        raise_on_update: bool = False,
        events: list[str] | None = None,
    ) -> None:
        self.final_reps = final_reps
        self.quality = quality
        self.finish_ok = finish_ok
        self.min_calibration_samples = min_calibration_samples
        self.raise_on_update = raise_on_update
        self.events = events
        self.calibration_samples = 0
        self.elapsed_ms: list[float] = []
        self.on_init_args: tuple[Any, ...] | None = None
        self.finish_calls = 0

    def _event(self, name: str) -> None:
        if self.events is not None:
            self.events.append(name)

    def on_init(self, age: int, sex: str, height: float) -> None:
        self._event("strategy.on_init")
        self.on_init_args = (age, sex, height)

    def reset(self) -> None:
        self._event("strategy.reset")

    def smoother_config(self) -> tuple[float, float]:
        self._event("strategy.smoother_config")
        return (1.25, 0.075)

    def is_frame_usable(self, landmarks: Any) -> bool:
        self._event("strategy.is_frame_usable")
        return landmarks != ["partial"]

    def on_calibration_frame(self, landmarks: Any, hand_landmarks: Any = None) -> None:
        self._event("strategy.on_calibration_frame")
        self.calibration_samples += 1

    def get_calibration_sample_count(self) -> int:
        self._event("strategy.get_calibration_sample_count")
        return self.calibration_samples

    def finish_calibration(self) -> tuple[bool, str | None]:
        self._event("strategy.finish_calibration")
        self.finish_calls += 1
        return self.finish_ok, None if self.finish_ok else "calibration failed"

    def update(self, landmarks: Any, elapsed_ms: float, hand_landmarks: Any = None) -> Any:
        self._event("strategy.update")
        if self.raise_on_update:
            raise RuntimeError("strategy update failed")
        self.elapsed_ms.append(elapsed_ms)
        return SimpleNamespace(reps=self.final_reps, finished=False)

    def finalize(self, context: Any) -> Any:
        self._event("strategy.finalize")
        return SimpleNamespace(reps=self.final_reps)

    def get_calibration_quality(self) -> float | None:
        self._event("strategy.get_calibration_quality")
        return self.quality


def _case(
    *,
    video_path: str = "videos/case.MP4",
    video_sha256: str = "a" * 64,
    case_id: str = "case-001",
    validity: ExpectedValidity = ExpectedValidity.VALID_MOVEMENT,
    expected_reps: int = 5,
    test_start_s: float = 6.5,
    test_end_s: float = 36.5,
) -> ValidationCase:
    return ValidationCase(
        case_id=case_id,
        video_path=video_path,
        video_sha256=video_sha256,
        source_type=SourceType.REAL,
        expected=ExpectedOutcome(validity, expected_reps, 0.5),
        subject=SubjectAnnotation(70, Sex.FEMALE, 160.0),
        timing=TimingAnnotation(0.0, 3.0, test_start_s, test_end_s),
        view=ViewMetadata("side", "full_body", "normal", "none"),
    )


def _files(tmp_path: Path, *, content: bytes = b"fake mp4") -> tuple[Path, Path, Path, str]:
    dataset_root = tmp_path / "dataset"
    manifest_path = dataset_root / "manifest.json"
    video_path = dataset_root / "videos" / "case.MP4"
    video_path.parent.mkdir(parents=True)
    video_path.write_bytes(content)
    manifest_path.write_text("{}", encoding="utf-8")
    return dataset_root, manifest_path, video_path, hashlib.sha256(content).hexdigest()


def _run(
    tmp_path: Path,
    *,
    case: ValidationCase | None = None,
    capture: FakeCapture | None = None,
    detector: FakeDetector | None = None,
    strategy: FakeStrategy | None = None,
    smoother: FakeSmoother | None = None,
    write_reports: bool = False,
    report_writer: Any = None,
) -> tuple[ReplayExecution, FakeCapture, FakeDetector, FakeStrategy, FakeSmoother]:
    dataset_root, manifest_path, _, digest = _files(tmp_path)
    selected_case = case or _case(video_sha256=digest)
    selected_capture = capture or FakeCapture()
    selected_detector = detector or FakeDetector()
    selected_strategy = strategy or FakeStrategy()
    selected_smoother = smoother or FakeSmoother()

    execution = replay_case(
        selected_case,
        manifest_path=manifest_path,
        dataset_root=dataset_root,
        write_reports=write_reports,
        capture_factory=lambda _: selected_capture,
        detector_factory=lambda: selected_detector,
        strategy_factory=lambda test_id: selected_strategy,
        smoother_factory=lambda **_: selected_smoother,
        report_writer=report_writer,
    )
    return (
        execution,
        selected_capture,
        selected_detector,
        selected_strategy,
        selected_smoother,
    )


def test_matching_checksum_returns_canonical_video(tmp_path: Path) -> None:
    root, manifest, video, digest = _files(tmp_path)

    assert validate_video_file("videos/case.MP4", digest, manifest, root) == video.resolve()


def test_checksum_mismatch_is_rejected_before_open(tmp_path: Path) -> None:
    root, manifest, _, _ = _files(tmp_path)

    with pytest.raises(ReplayValidationError, match="SHA-256 mismatch") as exc_info:
        validate_video_file("videos/case.MP4", "0" * 64, manifest, root)
    assert exc_info.value.failure_category is FailureCategory.VIDEO_UNREADABLE


def test_detectable_file_mutation_during_hashing_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, manifest, video, digest = _files(tmp_path)
    original_hash = replay_module.sha256_file

    def mutate_then_hash(path: Path) -> str:
        path.write_bytes(path.read_bytes() + b"changed")
        return original_hash(path)

    monkeypatch.setattr(replay_module, "sha256_file", mutate_then_hash)
    with pytest.raises(ReplayValidationError, match="changed while"):
        validate_video_file("videos/case.MP4", digest, manifest, root)
    assert video.read_bytes().endswith(b"changed")


def test_missing_video_is_rejected(tmp_path: Path) -> None:
    root, manifest, _, _ = _files(tmp_path)

    with pytest.raises(ReplayValidationError, match="does not exist"):
        validate_video_file("videos/missing.mp4", "0" * 64, manifest, root)


def test_unsupported_extension_is_rejected(tmp_path: Path) -> None:
    root, manifest, _, _ = _files(tmp_path)
    other = root / "videos" / "case.avi"
    other.write_bytes(b"video")

    with pytest.raises(ReplayValidationError, match="Only MP4"):
        validate_video_file("videos/case.avi", hashlib.sha256(b"video").hexdigest(), manifest, root)


@pytest.mark.parametrize(
    "stored",
    [
        "/absolute/video.mp4",
        r"C:\video.mp4",
        "file:/video.mp4",
        "file:///video.mp4",
        "http:video.mp4",
        "https://example/video.mp4",
    ],
)
def test_absolute_and_uri_paths_are_rejected(
    tmp_path: Path,
    stored: str,
) -> None:
    root, manifest, _, _ = _files(tmp_path)

    with pytest.raises(ReplayValidationError):
        resolve_safe_video_path(stored, manifest, root)


def test_traversal_and_dataset_root_escape_are_rejected(tmp_path: Path) -> None:
    root, manifest, _, _ = _files(tmp_path)

    with pytest.raises(ReplayValidationError, match="escapes dataset root"):
        resolve_safe_video_path("../../outside.mp4", manifest, root)


def test_symlinked_video_component_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, manifest, _, _ = _files(tmp_path)
    original = Path.is_symlink
    monkeypatch.setattr(
        Path,
        "is_symlink",
        lambda path: path.name == "case.MP4" or original(path),
    )

    with pytest.raises(ReplayValidationError, match="Symlinked video"):
        resolve_safe_video_path("videos/case.MP4", manifest, root)


def test_actual_filesystem_symlink_escape_is_rejected_when_supported(
    tmp_path: Path,
) -> None:
    root, manifest, _, _ = _files(tmp_path)
    outside = tmp_path / "outside.mp4"
    outside.write_bytes(b"outside")
    link = root / "videos" / "escape.mp4"
    try:
        link.symlink_to(outside)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"Filesystem symlink creation is unavailable: {exc}")

    with pytest.raises(ReplayValidationError, match="Symlinked video"):
        resolve_safe_video_path("videos/escape.mp4", manifest, root)


def test_oversized_file_is_rejected(tmp_path: Path) -> None:
    root, manifest, _, digest = _files(tmp_path, content=b"123")

    with pytest.raises(ReplayValidationError, match="size limit"):
        validate_video_file(
            "videos/case.MP4",
            digest,
            manifest,
            root,
            max_size_bytes=2,
        )


def test_unreadable_capture_maps_to_video_unreadable_and_cleans_up(tmp_path: Path) -> None:
    root, manifest, _, digest = _files(tmp_path)
    capture = FakeCapture(opened=False)
    detector = FakeDetector()

    result = replay_case(
        _case(video_sha256=digest),
        manifest_path=manifest,
        dataset_root=root,
        write_reports=False,
        capture_factory=lambda _: capture,
        detector_factory=lambda: detector,
    )

    assert result.case_result.detected.failure_category is FailureCategory.VIDEO_UNREADABLE
    assert capture.released is True
    assert detector.closed is True


@pytest.mark.parametrize(
    "fps",
    [None, "30", True, 0.0, -1.0, float("nan"), float("inf"), float("-inf")],
)
def test_invalid_fps_values_are_controlled_rejections(fps: object) -> None:
    with pytest.raises(ReplayValidationError, match="FPS"):
        validate_video_metadata(FakeCapture(fps=fps))


@pytest.mark.parametrize(
    ("property_id", "label"),
    [
        (cv2.CAP_PROP_FRAME_COUNT, "frame count"),
        (cv2.CAP_PROP_FRAME_WIDTH, "width"),
        (cv2.CAP_PROP_FRAME_HEIGHT, "height"),
    ],
)
@pytest.mark.parametrize(
    "value",
    [None, "100", True, 0, -1, 100.5, float("nan"), float("inf"), float("-inf")],
)
def test_invalid_integral_metadata_values_are_controlled_rejections(
    property_id: int,
    label: str,
    value: object,
) -> None:
    capture = FakeCapture()
    capture.properties[property_id] = value

    with pytest.raises(ReplayValidationError, match=label):
        validate_video_metadata(capture)


def test_fractional_fps_and_integer_valued_metadata_are_accepted() -> None:
    metadata = validate_video_metadata(
        FakeCapture(fps=29.97, frame_count=100.0, width=640.0, height=480.0)
    )

    assert metadata.fps == 29.97
    assert metadata.frame_count == 100
    assert metadata.width == 640
    assert metadata.height == 480


def test_over_resolution_is_rejected() -> None:
    with pytest.raises(ReplayValidationError, match="resolution"):
        validate_video_metadata(FakeCapture(width=1921))


def test_over_duration_is_rejected() -> None:
    with pytest.raises(ReplayValidationError, match="duration"):
        validate_video_metadata(FakeCapture(fps=1, frame_count=61))


def test_over_frame_count_is_rejected() -> None:
    with pytest.raises(ReplayValidationError, match="frame count"):
        validate_video_metadata(FakeCapture(fps=100, frame_count=3601))


def test_explicit_timing_boundaries_and_exact_active_window() -> None:
    timing = timing_for_case(_case(), fps=20.0)

    assert timing.to_dict() == {
        "calibration_start_s": 0.0,
        "calibration_end_s": 3.0,
        "test_start_s": 6.5,
        "test_end_s": 36.5,
        "active_window_tolerance_s": 0.05,
    }
    assert frame_window(0.0, timing) == "calibration"
    assert frame_window(3.0, timing) == "calibration"
    assert frame_window(3.000001, timing) == "gap"
    assert frame_window(6.5, timing) == "test"
    assert frame_window(36.5, timing) == "test"
    assert frame_window(36.5001, timing) == "after"


def test_active_window_allows_one_frame_tolerance() -> None:
    timing = timing_for_case(_case(test_end_s=36.6), fps=10.0)

    assert timing.active_window_tolerance_s == 0.1


def test_active_window_just_beyond_one_frame_tolerance_is_rejected() -> None:
    with pytest.raises(ReplayValidationError, match="30-second"):
        timing_for_case(_case(test_end_s=36.60001), fps=10.0)


def test_invalid_active_window_is_rejected_for_processable_case() -> None:
    with pytest.raises(ReplayValidationError, match="30-second") as exc_info:
        timing_for_case(_case(test_end_s=35.0), fps=30.0)
    assert exc_info.value.failure_category is FailureCategory.RUNTIME_ERROR


def test_invalid_input_does_not_require_processable_active_duration() -> None:
    timing = timing_for_case(
        _case(validity=ExpectedValidity.INVALID_INPUT, expected_reps=0, test_end_s=20.0),
        fps=30.0,
    )

    assert timing.test_end_s == 20.0


def test_production_lifecycle_factory_and_window_call_order(tmp_path: Path) -> None:
    root, manifest, _, digest = _files(tmp_path)
    events: list[str] = []
    capture = FakeCapture(frame_count=38, frames=[FRAME] * 38, events=events)
    detector = FakeDetector(events=events)
    strategy = FakeStrategy(events=events)
    smoother = FakeSmoother(events)
    factory_ids: list[str] = []
    smoother_configs: list[dict[str, float]] = []

    result = replay_case(
        _case(video_sha256=digest),
        manifest_path=manifest,
        dataset_root=root,
        write_reports=False,
        capture_factory=lambda _: capture,
        detector_factory=lambda: detector,
        strategy_factory=lambda test_id: (factory_ids.append(test_id) or strategy),
        smoother_factory=lambda **kwargs: (smoother_configs.append(kwargs) or smoother),
    )

    assert factory_ids == ["chair_stand"]
    assert strategy.on_init_args == (70, "female", 160.0)
    assert smoother_configs == [{"min_cutoff": 1.25, "beta": 0.075}]
    assert strategy.calibration_samples == 4
    assert len(strategy.elapsed_ms) == 30
    assert strategy.elapsed_ms[0] == 500.0
    assert strategy.elapsed_ms[-1] == 29_500.0
    assert result.timing.test_start_s == 6.5
    assert result.timing.test_end_s == 36.5
    assert result.counters.test_frames_used == 30
    assert events.index("strategy.on_init") < events.index("strategy.reset")
    assert events.index("strategy.reset") < events.index("strategy.smoother_config")
    assert events.index("strategy.smoother_config") < events.index("detector.init")
    assert events.index("strategy.on_calibration_frame") < events.index(
        "strategy.get_calibration_sample_count"
    )
    assert events.index("strategy.get_calibration_sample_count") < events.index(
        "strategy.finish_calibration"
    )
    assert events.index("strategy.finish_calibration") < events.index("strategy.update")
    assert events.index("strategy.update") < events.index("strategy.finalize")
    assert events.index("strategy.finalize") < events.index(
        "strategy.get_calibration_quality"
    )
    assert events[-2:] == ["capture.release", "detector.close"]


def test_exact_closed_boundaries_produce_zero_and_full_elapsed_times(
    tmp_path: Path,
) -> None:
    capture = FakeCapture(
        fps=2.0,
        frame_count=74,
        frames=[FRAME] * 74,
    )
    strategy = FakeStrategy()
    execution, _, _, strategy, _ = _run(
        tmp_path,
        capture=capture,
        strategy=strategy,
    )

    assert strategy.calibration_samples == 7
    assert strategy.elapsed_ms[0] == 0.0
    assert strategy.elapsed_ms[-1] == 30_000.0
    assert len(strategy.elapsed_ms) == 61
    assert execution.case_result.detected.status is ProcessingStatus.COMPLETED


def test_processable_video_ending_before_test_start_is_insufficient(
    tmp_path: Path,
) -> None:
    capture = FakeCapture(frames=[FRAME] * 4)
    strategy = FakeStrategy(events=[])
    execution, _, _, strategy, _ = _run(
        tmp_path,
        capture=capture,
        strategy=strategy,
    )

    assert execution.case_result.detected.failure_category is FailureCategory.INSUFFICIENT_TEST_SIGNAL
    assert "strategy.finalize" not in strategy.events


def test_processable_video_ending_during_active_window_never_finalizes(
    tmp_path: Path,
) -> None:
    capture = FakeCapture(frames=[FRAME] * 15)
    strategy = FakeStrategy(events=[])
    execution, _, _, strategy, _ = _run(
        tmp_path,
        capture=capture,
        strategy=strategy,
    )

    assert strategy.elapsed_ms
    assert execution.case_result.detected.status is ProcessingStatus.REJECTED
    assert execution.case_result.detected.failure_category is FailureCategory.INSUFFICIENT_TEST_SIGNAL
    assert "strategy.finalize" not in strategy.events


def test_processable_video_at_allowed_final_frame_boundary_can_complete(
    tmp_path: Path,
) -> None:
    capture = FakeCapture(fps=1.0, frame_count=37, frames=[FRAME] * 37)
    execution, _, _, _, _ = _run(tmp_path, capture=capture)

    assert execution.case_result.detected.status is ProcessingStatus.COMPLETED


def test_invalid_input_early_rejection_preserves_pose_missing(tmp_path: Path) -> None:
    root, manifest, _, digest = _files(tmp_path)
    execution = replay_case(
        _case(
            video_sha256=digest,
            validity=ExpectedValidity.INVALID_INPUT,
            expected_reps=0,
            test_end_s=20.0,
        ),
        manifest_path=manifest,
        dataset_root=root,
        write_reports=False,
        capture_factory=lambda _: FakeCapture(frames=[FRAME] * 4),
        detector_factory=lambda: FakeDetector(responses=[None] * 4),
        strategy_factory=lambda _: FakeStrategy(),
        smoother_factory=lambda **_: FakeSmoother(),
    )

    assert execution.case_result.comparison.passed is True
    assert execution.case_result.detected.failure_category is FailureCategory.POSE_MISSING
    assert execution.case_result.to_dict()["runtime_failure_category"] == "pose_missing"


@pytest.mark.parametrize("usable_samples", [0, 2])
def test_calibration_below_production_minimum_skips_finish(
    tmp_path: Path,
    usable_samples: int,
) -> None:
    calibration_responses = [POSE] * usable_samples + [["partial"]] * (4 - usable_samples)
    detector = FakeDetector(responses=calibration_responses)
    strategy = FakeStrategy(min_calibration_samples=3)
    execution, _, _, strategy, _ = _run(
        tmp_path,
        detector=detector,
        strategy=strategy,
    )

    assert strategy.calibration_samples == usable_samples
    assert strategy.finish_calls == 0
    assert execution.case_result.detected.failure_category is FailureCategory.CALIBRATION_FAILED


@pytest.mark.parametrize("usable_samples", [3, 4])
def test_calibration_at_or_above_production_minimum_finishes_once(
    tmp_path: Path,
    usable_samples: int,
) -> None:
    calibration_responses = [POSE] * usable_samples + [["partial"]] * (4 - usable_samples)
    detector = FakeDetector(responses=calibration_responses + [POSE] * 30)
    strategy = FakeStrategy(min_calibration_samples=3)
    execution, _, _, strategy, _ = _run(
        tmp_path,
        detector=detector,
        strategy=strategy,
    )

    assert strategy.calibration_samples == usable_samples
    assert strategy.finish_calls == 1
    assert execution.case_result.detected.status is ProcessingStatus.COMPLETED


def test_actual_frame_limit_overrides_underreported_metadata_and_cleans_up(
    tmp_path: Path,
) -> None:
    capture = FakeCapture(
        fps=100.0,
        frame_count=100,
        frames=[FRAME] * 3601,
    )
    detector = FakeDetector()
    strategy = FakeStrategy()
    execution, capture, detector, strategy, _ = _run(
        tmp_path,
        capture=capture,
        detector=detector,
        strategy=strategy,
    )

    assert execution.counters.frames_read == 3601
    assert execution.case_result.detected.failure_category is FailureCategory.VIDEO_UNREADABLE
    assert len(strategy.elapsed_ms) == 2950
    assert strategy.elapsed_ms[-1] == pytest.approx(29_490.0)
    assert capture.released is True
    assert detector.closed is True


def test_detector_returns_no_pose_preserves_runtime_reason(tmp_path: Path) -> None:
    detector = FakeDetector(responses=[None] * 40)
    execution, capture, detector, _, _ = _run(tmp_path, detector=detector)

    assert execution.case_result.detected.failure_category is FailureCategory.POSE_MISSING
    assert execution.case_result.to_dict()["runtime_failure_category"] == "pose_missing"
    assert execution.case_result.comparison.failure_category is FailureCategory.POSE_MISSING
    assert capture.released and detector.closed


def test_insufficient_usable_test_frames_are_rejected(tmp_path: Path) -> None:
    detector = FakeDetector(responses=[POSE] * 3 + [None] * 30)
    execution, _, _, _, _ = _run(tmp_path, detector=detector)

    assert execution.case_result.detected.failure_category is FailureCategory.INSUFFICIENT_TEST_SIGNAL


def test_calibration_failure_and_quality_are_propagated(tmp_path: Path) -> None:
    strategy = FakeStrategy(finish_ok=False, quality=0.25)
    execution, _, _, _, _ = _run(tmp_path, strategy=strategy)

    assert execution.case_result.detected.failure_category is FailureCategory.CALIBRATION_FAILED
    assert execution.case_result.detected.calibration_quality == 0.25


def test_success_captures_production_calibration_quality(tmp_path: Path) -> None:
    execution, _, _, _, _ = _run(tmp_path, strategy=FakeStrategy(quality=0.73))

    assert execution.case_result.detected.calibration_quality == 0.73


@pytest.mark.parametrize(
    ("detected_reps", "expected_reps", "failure"),
    [
        (5, 5, None),
        (3, 5, FailureCategory.REP_UNDER_COUNT),
        (7, 5, FailureCategory.REP_OVER_COUNT),
    ],
)
def test_exact_under_and_over_counts_use_phase1_comparison(
    tmp_path: Path,
    detected_reps: int,
    expected_reps: int,
    failure: FailureCategory | None,
) -> None:
    root, manifest, _, digest = _files(tmp_path)
    case = _case(video_sha256=digest, expected_reps=expected_reps)
    execution = replay_case(
        case,
        manifest_path=manifest,
        dataset_root=root,
        write_reports=False,
        capture_factory=lambda _: FakeCapture(),
        detector_factory=FakeDetector,
        strategy_factory=lambda _: FakeStrategy(final_reps=detected_reps),
        smoother_factory=lambda **_: FakeSmoother(),
    )

    assert execution.case_result.comparison.failure_category is failure
    assert execution.case_result.comparison.passed is (failure is None)


def test_invalid_movement_exact_zero_passes(tmp_path: Path) -> None:
    root, manifest, _, digest = _files(tmp_path)
    execution = replay_case(
        _case(
            video_sha256=digest,
            validity=ExpectedValidity.INVALID_MOVEMENT,
            expected_reps=0,
        ),
        manifest_path=manifest,
        dataset_root=root,
        write_reports=False,
        capture_factory=lambda _: FakeCapture(),
        detector_factory=FakeDetector,
        strategy_factory=lambda _: FakeStrategy(final_reps=0),
        smoother_factory=lambda **_: FakeSmoother(),
    )

    assert execution.case_result.comparison.passed is True


def test_invalid_input_can_pass_rejection_and_keep_runtime_failure(tmp_path: Path) -> None:
    root, manifest, _, digest = _files(tmp_path)
    execution = replay_case(
        _case(
            video_sha256=digest,
            validity=ExpectedValidity.INVALID_INPUT,
            expected_reps=0,
            test_end_s=20.0,
        ),
        manifest_path=manifest,
        dataset_root=root,
        write_reports=False,
        capture_factory=lambda _: FakeCapture(frame_count=20, frames=[FRAME] * 20),
        detector_factory=lambda: FakeDetector(responses=[None] * 20),
        strategy_factory=lambda _: FakeStrategy(),
        smoother_factory=lambda **_: FakeSmoother(),
    )

    assert execution.case_result.comparison.passed is True
    assert execution.case_result.comparison.failure_category is None
    assert execution.case_result.to_dict()["runtime_failure_category"] == "pose_missing"


def test_compare_outcomes_is_called_as_replay_result_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[Any, Any]] = []
    original = replay_module.compare_outcomes

    def spy(expected: Any, detected: Any) -> Any:
        calls.append((expected, detected))
        return original(expected, detected)

    monkeypatch.setattr(replay_module, "compare_outcomes", spy)
    execution, _, _, _, _ = _run(tmp_path)

    assert calls == [(execution.case.expected, execution.case_result.detected)]


def test_capture_and_detector_cleanup_when_detector_fails(tmp_path: Path) -> None:
    capture = FakeCapture()
    detector = FakeDetector(raise_on_detect=True)

    with pytest.raises(RuntimeError, match="detector failed"):
        _run(tmp_path, capture=capture, detector=detector)
    assert capture.released is True
    assert detector.closed is True


def test_capture_and_detector_cleanup_when_strategy_fails(tmp_path: Path) -> None:
    capture = FakeCapture()
    detector = FakeDetector()
    strategy = FakeStrategy(raise_on_update=True)

    with pytest.raises(RuntimeError, match="strategy update failed"):
        _run(tmp_path, capture=capture, detector=detector, strategy=strategy)
    assert capture.released is True
    assert detector.closed is True


def test_capture_and_detector_cleanup_when_report_writing_fails(tmp_path: Path) -> None:
    capture = FakeCapture()
    detector = FakeDetector()

    def fail_report(*_: Any) -> Any:
        raise OSError("report failed")

    with pytest.raises(OSError, match="report failed"):
        _run(
            tmp_path,
            capture=capture,
            detector=detector,
            write_reports=True,
            report_writer=fail_report,
        )
    assert capture.released is True
    assert detector.closed is True


def _report_execution(case_id: str = "case-001") -> ReplayExecution:
    case = _case(case_id=case_id)
    detected = DetectedOutcome(ProcessingStatus.COMPLETED, 5, 0.9)
    comparison = compare_outcomes(case.expected, detected)
    return ReplayExecution(
        case=case,
        case_result=CaseResult(case.case_id, case.expected, detected, comparison),
        manifest_sha256="b" * 64,
        timing=ReplayTiming(0.0, 3.0, 6.5, 36.5, 0.05),
        counters=ReplayCounters(37, 33, 3, 30, 30),
        metadata=VideoMetadata(1.0, 37, 640, 480, 37.0),
    )


def test_json_csv_field_parity_and_privacy_omissions(tmp_path: Path) -> None:
    paths = write_case_report(_report_execution(), tmp_path, "run-001")
    json_row = json.loads(paths.json_path.read_text(encoding="utf-8"))
    with paths.csv_path.open(encoding="utf-8", newline="") as stream:
        csv_row = next(csv.DictReader(stream))

    assert set(json_row) == set(csv_row)
    assert json_row["runtime_failure_category"] is None
    assert "video_path" not in json_row
    assert not any(key.startswith("subject_") for key in json_row)
    assert not {
        "age",
        "sex",
        "height_cm",
        "name",
        "email",
        "nric",
        "participant_id",
    } & json_row.keys()

    assert csv_row["processing_status"] == json_row["processing_status"]
    assert int(csv_row["expected_repetitions"]) == json_row["expected_repetitions"]
    assert int(csv_row["detected_repetitions"]) == json_row["detected_repetitions"]
    assert int(csv_row["rep_error"]) == json_row["rep_error"]
    assert int(csv_row["absolute_rep_error"]) == json_row["absolute_rep_error"]
    assert (csv_row["passed"] == "True") is json_row["passed"]
    assert float(csv_row["calibration_quality"]) == json_row["calibration_quality"]
    assert csv_row["failure_category"] == ""
    assert csv_row["runtime_failure_category"] == ""


def test_runtime_failure_category_is_written_to_json_and_csv(tmp_path: Path) -> None:
    case = _case(
        validity=ExpectedValidity.INVALID_INPUT,
        expected_reps=0,
        test_end_s=20.0,
    )
    detected = DetectedOutcome(
        ProcessingStatus.REJECTED,
        failure_category=FailureCategory.POSE_MISSING,
    )
    execution = _report_execution()
    execution.case = case
    execution.case_result = CaseResult(
        case.case_id,
        case.expected,
        detected,
        compare_outcomes(case.expected, detected),
    )
    paths = write_case_report(execution, tmp_path, "run-runtime")

    json_row = json.loads(paths.json_path.read_text(encoding="utf-8"))
    with paths.csv_path.open(encoding="utf-8", newline="") as stream:
        csv_row = next(csv.DictReader(stream))
    assert json_row["failure_category"] is None
    assert json_row["runtime_failure_category"] == "pose_missing"
    assert csv_row["runtime_failure_category"] == "pose_missing"


def test_csv_formula_injection_is_sanitised_without_changing_json(tmp_path: Path) -> None:
    paths = write_case_report(_report_execution("=2+2"), tmp_path, "run-formula")
    json_row = json.loads(paths.json_path.read_text(encoding="utf-8"))
    with paths.csv_path.open(encoding="utf-8", newline="") as stream:
        csv_row = next(csv.DictReader(stream))

    assert sanitise_csv_value("@cmd") == "'@cmd"
    assert json_row["case_id"] == "=2+2"
    assert csv_row["case_id"] == "'=2+2"


def test_output_directories_are_unique_and_overwrite_is_refused(tmp_path: Path) -> None:
    first = write_case_report(_report_execution(), tmp_path)
    second = write_case_report(_report_execution(), tmp_path)

    assert first.run_directory != second.run_directory
    with pytest.raises(FileExistsError):
        write_case_report(_report_execution(), tmp_path, first.run_id)


def test_successful_transaction_leaves_only_final_json_and_csv(tmp_path: Path) -> None:
    paths = write_case_report(_report_execution(), tmp_path, "run-success")

    assert set(paths.run_directory.iterdir()) == {paths.json_path, paths.csv_path}
    assert list(tmp_path.iterdir()) == [paths.run_directory]


def test_json_serialization_failure_removes_temporary_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_json(*_: Any, **__: Any) -> None:
        raise TypeError("json serialization failed")

    monkeypatch.setattr(replay_module.json, "dump", fail_json)
    with pytest.raises(TypeError, match="json serialization failed"):
        write_case_report(_report_execution(), tmp_path, "run-json-fail")
    assert list(tmp_path.iterdir()) == []


def test_csv_header_failure_removes_json_and_temporary_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class HeaderFailureWriter:
        def writeheader(self) -> None:
            raise OSError("CSV header failed")

        def writerow(self, row: Any) -> None:
            raise AssertionError("row must not be attempted")

    monkeypatch.setattr(
        replay_module.csv,
        "DictWriter",
        lambda *args, **kwargs: HeaderFailureWriter(),
    )
    with pytest.raises(OSError, match="CSV header failed"):
        write_case_report(_report_execution(), tmp_path, "run-header-fail")
    assert list(tmp_path.iterdir()) == []


def test_csv_row_failure_removes_every_partial_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RowFailureWriter:
        def writeheader(self) -> None:
            return None

        def writerow(self, row: Any) -> None:
            raise OSError("CSV row failed")

    monkeypatch.setattr(
        replay_module.csv,
        "DictWriter",
        lambda *args, **kwargs: RowFailureWriter(),
    )
    with pytest.raises(OSError, match="CSV row failed"):
        write_case_report(_report_execution(), tmp_path, "run-row-fail")
    assert list(tmp_path.iterdir()) == []


def test_report_failure_preserves_existing_successful_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    successful = write_case_report(_report_execution(), tmp_path, "run-existing")
    original_json = successful.json_path.read_bytes()

    def fail_json(*_: Any, **__: Any) -> None:
        raise TypeError("new report failed")

    monkeypatch.setattr(replay_module.json, "dump", fail_json)
    with pytest.raises(TypeError, match="new report failed"):
        write_case_report(_report_execution(), tmp_path, "run-new")

    assert successful.json_path.read_bytes() == original_json
    assert set(tmp_path.iterdir()) == {successful.run_directory}


def test_existing_final_directory_is_never_touched(tmp_path: Path) -> None:
    final_directory = tmp_path / "run-collision"
    final_directory.mkdir()
    marker = final_directory / "keep.txt"
    marker.write_text("preserve", encoding="utf-8")

    with pytest.raises(FileExistsError):
        write_case_report(_report_execution(), tmp_path, "run-collision")

    assert marker.read_text(encoding="utf-8") == "preserve"
    assert set(tmp_path.iterdir()) == {final_directory}
