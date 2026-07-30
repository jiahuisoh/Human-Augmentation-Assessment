"""Secure offline MP4 replay through the production chair-stand pipeline."""

from __future__ import annotations

import argparse
import csv
import json
import math
import numbers
import os
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Literal, Protocol, Sequence

import cv2

from app.cv.landmark_smoother import LandmarkSmoother
from app.cv.pose_detector import PoseDetector
from app.cv.types import Landmark
from app.tests.base import FinalizeContext, TestStrategy
from app.tests.strategies import strategy_for
from validation.chair_stand.production_mapping import (
    map_subject_to_production,
    production_chair_stand_durations,
)
from validation.chair_stand.schema import (
    CaseResult,
    DetectedOutcome,
    ExpectedValidity,
    FailureCategory,
    ProcessingStatus,
    ValidationCase,
    compare_outcomes,
    load_manifest,
    sha256_file,
)


MAX_VIDEO_BYTES = 500 * 1024 * 1024
MAX_VIDEO_WIDTH = 1920
MAX_VIDEO_HEIGHT = 1080
MAX_VIDEO_DURATION_S = 60.0
MAX_VIDEO_FRAMES = 3600
DEFAULT_OUTPUT_BASE = Path(__file__).resolve().parents[2] / "validation_results" / "chair_stand"

_SCHEME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@")


class Capture(Protocol):
    def isOpened(self) -> bool: ...

    def read(self) -> tuple[bool, Any]: ...

    def get(self, property_id: int) -> object: ...

    def release(self) -> None: ...


class Detector(Protocol):
    def init(self) -> None: ...

    def detect(self, rgb_image: Any) -> Sequence[Landmark] | None: ...

    def close(self) -> None: ...


class Smoother(Protocol):
    def smooth(
        self,
        landmarks: Sequence[Landmark],
        timestamp_ms: float,
    ) -> Sequence[Landmark]: ...


CaptureFactory = Callable[[str], Capture]
DetectorFactory = Callable[[], Detector]
StrategyFactory = Callable[[str], TestStrategy]
SmootherFactory = Callable[..., Smoother]


class ReplayValidationError(ValueError):
    """Actionable preflight or metadata failure using an existing category."""

    def __init__(self, message: str, failure_category: FailureCategory) -> None:
        super().__init__(message)
        self.failure_category = failure_category


@dataclass(frozen=True)
class VideoMetadata:
    fps: float
    frame_count: int
    width: int
    height: int
    duration_s: float

    def to_dict(self) -> dict[str, int | float]:
        return {
            "video_fps": self.fps,
            "video_frame_count": self.frame_count,
            "video_width": self.width,
            "video_height": self.height,
            "video_duration_s": self.duration_s,
        }


@dataclass(frozen=True)
class ReplayTiming:
    calibration_start_s: float
    calibration_end_s: float
    test_start_s: float
    test_end_s: float
    active_window_tolerance_s: float | None

    def to_dict(self) -> dict[str, float | None]:
        return {
            "calibration_start_s": self.calibration_start_s,
            "calibration_end_s": self.calibration_end_s,
            "test_start_s": self.test_start_s,
            "test_end_s": self.test_end_s,
            "active_window_tolerance_s": self.active_window_tolerance_s,
        }


@dataclass
class ReplayCounters:
    frames_read: int = 0
    frames_with_pose: int = 0
    calibration_frames_used: int = 0
    test_frames_seen: int = 0
    test_frames_used: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "frames_read": self.frames_read,
            "frames_with_pose": self.frames_with_pose,
            "calibration_frames_used": self.calibration_frames_used,
            "test_frames_seen": self.test_frames_seen,
            "test_frames_used": self.test_frames_used,
        }


@dataclass(frozen=True)
class ReportPaths:
    run_id: str
    run_directory: Path
    json_path: Path
    csv_path: Path


@dataclass
class ReplayExecution:
    case: ValidationCase
    case_result: CaseResult
    manifest_sha256: str
    timing: ReplayTiming
    counters: ReplayCounters
    metadata: VideoMetadata | None
    report_paths: ReportPaths | None = None

    def to_report_row(self, run_id: str) -> dict[str, str | int | float | bool | None]:
        row: dict[str, str | int | float | bool | None] = {
            "run_id": run_id,
            "manifest_sha256": self.manifest_sha256,
            "video_sha256": self.case.video_sha256,
        }
        row.update(self.case_result.to_dict())
        row.update(self.timing.to_dict())
        row.update(
            self.metadata.to_dict()
            if self.metadata is not None
            else {
                "video_fps": None,
                "video_frame_count": None,
                "video_width": None,
                "video_height": None,
                "video_duration_s": None,
            }
        )
        row.update(self.counters.to_dict())
        return row


def resolve_safe_video_path(
    video_path: str,
    manifest_path: Path,
    dataset_root: Path,
) -> Path:
    """Resolve a stored path while enforcing the canonical dataset boundary."""
    if not isinstance(video_path, str) or not video_path:
        raise _video_error("video_path must be a non-empty relative path")
    if video_path != video_path.strip():
        raise _video_error("video_path must not contain surrounding whitespace")
    if "\x00" in video_path:
        raise _video_error("video_path must not contain a NUL byte")
    if "\\" in video_path:
        raise _video_error("video_path must use forward slashes")
    if _SCHEME_PATTERN.match(video_path):
        raise _video_error("video_path must be a relative path without a URI scheme")

    portable = PurePosixPath(video_path)
    if portable.is_absolute():
        raise _video_error("video_path must be relative to the manifest")

    root = Path(dataset_root)
    if not root.exists() or not root.is_dir():
        raise _video_error(f"Dataset root does not exist or is not a directory: {root}")
    canonical_root = root.resolve(strict=True)

    logical_path = Path(
        os.path.abspath(Path(manifest_path).parent.joinpath(*portable.parts))
    )
    if not _is_relative_to(logical_path, canonical_root):
        raise _video_error(
            f"Resolved video path escapes dataset root: {logical_path}"
        )
    if _contains_symlink(logical_path, canonical_root):
        raise _video_error(f"Symlinked video paths are not allowed: {logical_path}")

    canonical_video = logical_path.resolve(strict=False)
    if not _is_relative_to(canonical_video, canonical_root):
        raise _video_error(
            f"Canonical video path escapes dataset root: {canonical_video}"
        )
    return canonical_video


def validate_video_file(
    video_path: str,
    expected_sha256: str,
    manifest_path: Path,
    dataset_root: Path,
    *,
    max_size_bytes: int = MAX_VIDEO_BYTES,
) -> Path:
    """Validate extension, file type, size, and digest before OpenCV opens it."""
    path = resolve_safe_video_path(video_path, manifest_path, dataset_root)
    if path.suffix.lower() != ".mp4":
        raise _video_error(f"Only MP4 videos are supported: {path}")
    if not path.exists():
        raise _video_error(f"Video file does not exist: {path}")
    if path.is_symlink():
        raise _video_error(f"Symlinked videos are not allowed: {path}")
    if not path.is_file():
        raise _video_error(f"Video path is not a regular file: {path}")

    before = path.stat()
    if before.st_size > max_size_bytes:
        raise _video_error(
            f"Video exceeds the {max_size_bytes}-byte size limit: {before.st_size} bytes"
        )
    actual_sha256 = sha256_file(path)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise _video_error(f"Video changed while its checksum was being verified: {path}")
    if actual_sha256 != expected_sha256.lower():
        raise _video_error(
            f"Video SHA-256 mismatch for {path}; expected {expected_sha256.lower()}, "
            f"got {actual_sha256}"
        )
    return path


def validate_video_metadata(capture: Capture) -> VideoMetadata:
    """Read and enforce bounded, finite OpenCV metadata without FPS fallback."""
    fps = _positive_metadata_number(capture, cv2.CAP_PROP_FPS, "FPS")
    frame_count = _positive_integer_metadata(
        capture,
        cv2.CAP_PROP_FRAME_COUNT,
        "frame count",
    )
    width = _positive_integer_metadata(capture, cv2.CAP_PROP_FRAME_WIDTH, "width")
    height = _positive_integer_metadata(capture, cv2.CAP_PROP_FRAME_HEIGHT, "height")
    duration_s = frame_count / fps
    if frame_count > MAX_VIDEO_FRAMES:
        raise _video_error(
            f"Video frame count {frame_count} exceeds limit {MAX_VIDEO_FRAMES}"
        )
    if width > MAX_VIDEO_WIDTH or height > MAX_VIDEO_HEIGHT:
        raise _video_error(
            f"Video resolution {width} x {height} exceeds "
            f"{MAX_VIDEO_WIDTH} x {MAX_VIDEO_HEIGHT}"
        )
    if duration_s > MAX_VIDEO_DURATION_S:
        raise _video_error(
            f"Video duration {duration_s:.3f}s exceeds limit {MAX_VIDEO_DURATION_S:.0f}s"
        )
    return VideoMetadata(fps, frame_count, width, height, duration_s)


def timing_for_case(case: ValidationCase, fps: float) -> ReplayTiming:
    """Validate annotations against the production-owned duration profile."""
    tolerance_s = max(0.05, 1.0 / fps)
    if case.expected.validity is not ExpectedValidity.INVALID_INPUT:
        durations = production_chair_stand_durations()
        calibration_duration_s = (
            case.timing.calibration_end_s - case.timing.calibration_start_s
        )
        active_duration_s = case.timing.test_end_s - case.timing.test_start_s
        if _exceeds_tolerance(
            abs(calibration_duration_s - durations.calibration_s),
            tolerance_s,
        ):
            raise ReplayValidationError(
                "Processable chair-stand cases require a "
                f"{durations.calibration_s:g}-second production calibration interval; "
                f"got {calibration_duration_s:.6f}s with tolerance {tolerance_s:.6f}s",
                FailureCategory.RUNTIME_ERROR,
            )
        if _exceeds_tolerance(
            abs(active_duration_s - durations.active_duration_s),
            tolerance_s,
        ):
            raise ReplayValidationError(
                "Processable chair-stand cases require a "
                f"{durations.active_duration_s:g}-second production active test interval; "
                f"got {active_duration_s:.6f}s with tolerance {tolerance_s:.6f}s",
                FailureCategory.RUNTIME_ERROR,
            )
    return ReplayTiming(
        calibration_start_s=case.timing.calibration_start_s,
        calibration_end_s=case.timing.calibration_end_s,
        test_start_s=case.timing.test_start_s,
        test_end_s=case.timing.test_end_s,
        active_window_tolerance_s=tolerance_s,
    )


def frame_window(
    timestamp_s: float,
    timing: ReplayTiming,
) -> Literal["before", "calibration", "gap", "test", "after"]:
    """Closed offline windows mirror process-current-frame-before-transition."""
    if timestamp_s < timing.calibration_start_s:
        return "before"
    if timestamp_s <= timing.calibration_end_s:
        return "calibration"
    if timestamp_s < timing.test_start_s:
        return "gap"
    if timestamp_s <= timing.test_end_s:
        return "test"
    return "after"


def replay_case(
    case: ValidationCase,
    *,
    manifest_path: Path,
    dataset_root: Path,
    output_base: Path | None = None,
    write_reports: bool = True,
    run_id: str | None = None,
    capture_factory: CaptureFactory | None = None,
    detector_factory: DetectorFactory = PoseDetector,
    strategy_factory: StrategyFactory = strategy_for,
    smoother_factory: SmootherFactory = LandmarkSmoother,
    report_writer: Callable[[ReplayExecution, Path | None, str | None], ReportPaths]
    | None = None,
) -> ReplayExecution:
    """Replay one validated manifest case through current production interfaces."""
    video = validate_video_file(
        case.video_path,
        case.video_sha256,
        manifest_path,
        dataset_root,
    )
    manifest_sha256 = sha256_file(Path(manifest_path))
    capture_builder = capture_factory or (lambda path: cv2.VideoCapture(path))
    capture = capture_builder(str(video))
    detector: Detector | None = None

    try:
        detector = detector_factory()
        if not capture.isOpened():
            execution = _rejected_execution(
                case,
                manifest_sha256,
                FailureCategory.VIDEO_UNREADABLE,
            )
            return _write_if_requested(
                execution,
                write_reports,
                output_base,
                run_id,
                report_writer,
            )

        metadata = validate_video_metadata(capture)
        timing = timing_for_case(case, metadata.fps)
        strategy = strategy_factory("chair_stand")
        subject = map_subject_to_production(case.subject)
        strategy.on_init(subject.age, subject.sex, subject.height_cm)
        strategy.reset()
        min_cutoff, beta = strategy.smoother_config()
        smoother = smoother_factory(min_cutoff=min_cutoff, beta=beta)
        detector.init()

        execution = _run_frames(
            case=case,
            manifest_sha256=manifest_sha256,
            capture=capture,
            detector=detector,
            strategy=strategy,
            smoother=smoother,
            metadata=metadata,
            timing=timing,
        )
        return _write_if_requested(
            execution,
            write_reports,
            output_base,
            run_id,
            report_writer,
        )
    finally:
        capture.release()
        if detector is not None:
            detector.close()


def write_case_report(
    execution: ReplayExecution,
    output_base: Path | None = None,
    run_id: str | None = None,
) -> ReportPaths:
    """Transactionally write canonical JSON and spreadsheet-safe summary CSV."""
    base = Path(output_base) if output_base is not None else DEFAULT_OUTPUT_BASE
    base.mkdir(parents=True, exist_ok=True)
    selected_run_id = run_id or uuid.uuid4().hex
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", selected_run_id):
        raise ValueError("run_id must contain only letters, digits, dot, underscore, or hyphen")
    final_directory = base / selected_run_id
    if final_directory.exists():
        raise FileExistsError(f"Run directory already exists: {final_directory}")

    temporary_directory = base / f".{selected_run_id}.tmp-{uuid.uuid4().hex}"
    temporary_directory.mkdir(exist_ok=False)
    temporary_json = temporary_directory / "result.json"
    temporary_csv = temporary_directory / "result.csv"
    try:
        row = execution.to_report_row(selected_run_id)
        with temporary_json.open("x", encoding="utf-8") as stream:
            json.dump(row, stream, ensure_ascii=False, allow_nan=False, indent=2)
            stream.write("\n")
        with temporary_csv.open("x", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(row))
            writer.writeheader()
            writer.writerow(
                {key: sanitise_csv_value(value) for key, value in row.items()}
            )
        temporary_directory.rename(final_directory)
    except BaseException as exc:
        try:
            if temporary_directory.exists():
                shutil.rmtree(temporary_directory)
        except OSError as cleanup_error:
            exc.add_note(f"Temporary report cleanup also failed: {cleanup_error}")
        raise

    return ReportPaths(
        selected_run_id,
        final_directory,
        final_directory / "result.json",
        final_directory / "result.csv",
    )


def sanitise_csv_value(value: str | int | float | bool | None) -> str | int | float | bool | None:
    if isinstance(value, str) and value.startswith(_CSV_FORMULA_PREFIXES):
        return f"'{value}"
    return value


def _run_frames(
    *,
    case: ValidationCase,
    manifest_sha256: str,
    capture: Capture,
    detector: Detector,
    strategy: TestStrategy,
    smoother: Smoother,
    metadata: VideoMetadata,
    timing: ReplayTiming,
) -> ReplayExecution:
    counters = ReplayCounters()
    calibration_finished = False
    calibration_ok = False
    frame_limit_exceeded = False
    last_decoded_timestamp_s: float | None = None

    while True:
        read_ok, frame = capture.read()
        if not read_ok:
            break
        counters.frames_read += 1
        frame_index = counters.frames_read - 1
        timestamp_s = frame_index / metadata.fps
        last_decoded_timestamp_s = timestamp_s
        if counters.frames_read > MAX_VIDEO_FRAMES:
            frame_limit_exceeded = True
            break
        window = frame_window(timestamp_s, timing)
        if window == "after":
            break

        if not calibration_finished and timestamp_s > timing.calibration_end_s:
            calibration_ok = _finish_calibration(strategy)
            calibration_finished = True
            if not calibration_ok:
                break

        if window in {"before", "gap"}:
            continue

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        raw_landmarks = detector.detect(rgb)
        if raw_landmarks is None:
            if window == "test":
                counters.test_frames_seen += 1
            continue

        counters.frames_with_pose += 1
        timestamp_ms = timestamp_s * 1000.0
        landmarks = smoother.smooth(raw_landmarks, timestamp_ms)
        usable = strategy.is_frame_usable(landmarks)
        if window == "calibration":
            if usable:
                strategy.on_calibration_frame(landmarks)
                counters.calibration_frames_used += 1
            if timestamp_s == timing.calibration_end_s:
                calibration_ok = _finish_calibration(strategy)
                calibration_finished = True
                if not calibration_ok:
                    break
            continue

        counters.test_frames_seen += 1
        if usable:
            strategy.update(
                landmarks,
                elapsed_ms=(timestamp_s - timing.test_start_s) * 1000.0,
            )
            counters.test_frames_used += 1

    if not calibration_finished:
        calibration_ok = _finish_calibration(strategy)
        calibration_finished = True

    active_window_covered = (
        last_decoded_timestamp_s is not None
        and not _exceeds_tolerance(
            timing.test_end_s - last_decoded_timestamp_s,
            timing.active_window_tolerance_s or 0.0,
        )
    )

    if frame_limit_exceeded:
        detected = DetectedOutcome(
            ProcessingStatus.REJECTED,
            calibration_quality=strategy.get_calibration_quality(),
            failure_category=FailureCategory.VIDEO_UNREADABLE,
        )
    elif counters.frames_read == 0:
        detected = DetectedOutcome(
            ProcessingStatus.REJECTED,
            failure_category=FailureCategory.VIDEO_UNREADABLE,
        )
    elif counters.frames_with_pose == 0:
        detected = DetectedOutcome(
            ProcessingStatus.REJECTED,
            failure_category=FailureCategory.POSE_MISSING,
        )
    elif not calibration_ok:
        detected = DetectedOutcome(
            ProcessingStatus.REJECTED,
            calibration_quality=strategy.get_calibration_quality(),
            failure_category=FailureCategory.CALIBRATION_FAILED,
        )
    elif not active_window_covered:
        detected = DetectedOutcome(
            ProcessingStatus.REJECTED,
            calibration_quality=strategy.get_calibration_quality(),
            failure_category=FailureCategory.INSUFFICIENT_TEST_SIGNAL,
        )
    elif counters.test_frames_used == 0:
        detected = DetectedOutcome(
            ProcessingStatus.REJECTED,
            calibration_quality=strategy.get_calibration_quality(),
            failure_category=FailureCategory.INSUFFICIENT_TEST_SIGNAL,
        )
    else:
        outcome = strategy.finalize(
            FinalizeContext(
                user_age=case.subject.age,
                user_sex=case.subject.sex.value,
                terminated_early=False,
            )
        )
        calibration_quality = strategy.get_calibration_quality()
        if outcome.reps is None:
            raise RuntimeError("Chair-stand strategy finalized without a repetition count")
        if calibration_quality is None:
            detected = DetectedOutcome(
                ProcessingStatus.REJECTED,
                failure_category=FailureCategory.CALIBRATION_FAILED,
            )
        else:
            detected = DetectedOutcome(
                ProcessingStatus.COMPLETED,
                repetitions=outcome.reps,
                calibration_quality=calibration_quality,
            )

    comparison = compare_outcomes(case.expected, detected)
    case_result = CaseResult(case.case_id, case.expected, detected, comparison)
    return ReplayExecution(
        case=case,
        case_result=case_result,
        manifest_sha256=manifest_sha256,
        timing=timing,
        counters=counters,
        metadata=metadata,
    )


def _rejected_execution(
    case: ValidationCase,
    manifest_sha256: str,
    category: FailureCategory,
) -> ReplayExecution:
    detected = DetectedOutcome(ProcessingStatus.REJECTED, failure_category=category)
    comparison = compare_outcomes(case.expected, detected)
    return ReplayExecution(
        case=case,
        case_result=CaseResult(case.case_id, case.expected, detected, comparison),
        manifest_sha256=manifest_sha256,
        timing=ReplayTiming(
            case.timing.calibration_start_s,
            case.timing.calibration_end_s,
            case.timing.test_start_s,
            case.timing.test_end_s,
            None,
        ),
        counters=ReplayCounters(),
        metadata=None,
    )


def _finish_calibration(strategy: TestStrategy) -> bool:
    sample_count = strategy.get_calibration_sample_count()
    if sample_count < strategy.min_calibration_samples:
        return False
    calibration_ok, _ = strategy.finish_calibration()
    return calibration_ok


def _write_if_requested(
    execution: ReplayExecution,
    enabled: bool,
    output_base: Path | None,
    run_id: str | None,
    report_writer: Callable[[ReplayExecution, Path | None, str | None], ReportPaths]
    | None,
) -> ReplayExecution:
    if enabled:
        writer = report_writer or write_case_report
        execution.report_paths = writer(execution, output_base, run_id)
    return execution


def _positive_metadata_number(capture: Capture, property_id: int, label: str) -> float:
    raw_value = capture.get(property_id)
    if isinstance(raw_value, bool) or not isinstance(raw_value, numbers.Real):
        raise _video_error(f"Video {label} must be numeric; got {raw_value!r}")
    value = float(raw_value)
    if not math.isfinite(value) or value <= 0:
        raise _video_error(
            f"Video {label} must be finite and greater than zero; got {value}"
        )
    return value


def _positive_integer_metadata(capture: Capture, property_id: int, label: str) -> int:
    value = _positive_metadata_number(capture, property_id, label)
    if not value.is_integer():
        raise _video_error(f"Video {label} must be integer-valued; got {value}")
    return int(value)


def _exceeds_tolerance(difference: float, tolerance: float) -> bool:
    return difference > tolerance and not math.isclose(
        difference,
        tolerance,
        rel_tol=0.0,
        abs_tol=1e-9,
    )


def _contains_symlink(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            return True
    return False


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _video_error(message: str) -> ReplayValidationError:
    return ReplayValidationError(message, FailureCategory.VIDEO_UNREADABLE)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replay one chair-stand manifest case through production CV logic."
    )
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--output-base", type=Path, default=DEFAULT_OUTPUT_BASE)
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    case = next((item for item in manifest.cases if item.case_id == args.case_id), None)
    if case is None:
        parser.error(f"Case {args.case_id!r} was not found in {args.manifest}")
    execution = replay_case(
        case,
        manifest_path=args.manifest,
        dataset_root=args.dataset_root,
        output_base=args.output_base,
    )
    assert execution.report_paths is not None
    print(json.dumps(execution.to_report_row(execution.report_paths.run_id), indent=2))
    return 0 if execution.case_result.comparison.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
