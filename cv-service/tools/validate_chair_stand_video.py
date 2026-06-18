from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import cv2

from app.cv.landmark_smoother import LandmarkSmoother
from app.cv.pose_detector import detector
from app.tests.base import FinalizeContext
from app.tests.chair_stand.strategy import ChairStandStrategy


ExpectedValidity = Literal["valid_movement", "invalid_movement", "invalid_input"]

ValidationStatus = Literal[
    "completed",
    "invalid_video",
    "no_pose_detected",
    "calibration_failed",
    "insufficient_test_signal",
    "low_detection_quality",
    "runtime_error",
]


REJECTION_STATUSES: set[str] = {
    "invalid_video",
    "no_pose_detected",
    "calibration_failed",
    "insufficient_test_signal",
    "low_detection_quality",
}


@dataclass(frozen=True)
class ValidationConfig:
    video_path: Path
    expected_reps: int
    expected_validity: ExpectedValidity
    scenario: str
    camera_angle: str
    calibration_seconds: float
    skip_after_calibration_seconds: float
    max_test_seconds: float
    user_age: int
    user_sex: str
    min_usable_frame_ratio: float
    output_json: Path | None
    debug_csv: Path | None


@dataclass
class FrameCounters:
    frames_read: int = 0
    frames_with_pose: int = 0
    usable_pose_frames: int = 0
    partial_pose_frames: int = 0
    missing_pose_frames: int = 0
    calibration_frames_used: int = 0
    test_frames_seen: int = 0
    test_frames_used: int = 0
    strategy_updates_applied: int = 0
    rep_increment_events: int = 0


@dataclass
class VideoMetadata:
    fps: float
    total_frame_count: int
    width: int
    height: int


@dataclass
class ValidationResult:
    video: str
    scenario: str
    camera_angle: str
    expected_validity: str
    expected_reps: int
    predicted_reps: int | None
    passed: bool
    status: ValidationStatus
    failure_reason: str | None
    calibration_ok: bool
    calibration_error: str | None
    usable_frame_ratio: float
    final_posture: str | None
    final_angle: float | None
    metadata: dict[str, Any]
    counters: dict[str, int]
    outcome: dict[str, Any] | None


def parse_args() -> ValidationConfig:
    parser = argparse.ArgumentParser(
        description=(
            "Stress-test the existing chair-stand CV logic against a local video. "
            "This validator separates bad input, bad calibration, and wrong rep counting."
        )
    )

    parser.add_argument(
        "--video",
        required=True,
        help="Path to the video file inside the runtime environment.",
    )

    parser.add_argument(
        "--expected-reps",
        type=int,
        required=True,
        help="Correct rep count for this video.",
    )

    parser.add_argument(
        "--expected-validity",
        choices=["valid_movement", "invalid_movement", "invalid_input"],
        required=True,
        help=(
            "valid_movement = normal full movement, "
            "invalid_movement = human movement that should not count, "
            "invalid_input = bad/no-human video that should be rejected."
        ),
    )

    parser.add_argument(
        "--scenario",
        required=True,
        help="Scenario label, e.g. full_rep, half_rep, small_bounce, standing_still, no_person.",
    )

    parser.add_argument(
        "--camera-angle",
        default="unknown",
        help="Camera angle label, e.g. side, front, angled, unknown.",
    )

    parser.add_argument(
        "--calibration-seconds",
        type=float,
        default=3.0,
        help="Number of initial seconds used for calibration.",
    )

    parser.add_argument(
        "--skip-after-calibration-seconds",
        type=float,
        default=0.0,
        help="Seconds to ignore after calibration before active testing begins.",
    )

    parser.add_argument(
        "--max-test-seconds",
        type=float,
        default=30.0,
        help="Maximum active test duration.",
    )

    parser.add_argument(
        "--user-age",
        type=int,
        default=70,
        help="Age used only for final norm classification.",
    )

    parser.add_argument(
        "--user-sex",
        choices=["male", "female", "other"],
        default="other",
        help="Sex used only for final norm classification.",
    )

    parser.add_argument(
        "--min-usable-frame-ratio",
        type=float,
        default=0.20,
        help=(
            "Minimum ratio of frames with usable pose landmarks. "
            "If too low, the video is rejected instead of accidentally passed."
        ),
    )

    parser.add_argument(
        "--output-json",
        default=None,
        help="Optional path to save the structured result JSON.",
    )

    parser.add_argument(
        "--debug-csv",
        default=None,
        help="Optional path to save frame-level debug rows.",
    )

    args = parser.parse_args()

    config = ValidationConfig(
        video_path=Path(args.video),
        expected_reps=args.expected_reps,
        expected_validity=args.expected_validity,
        scenario=args.scenario,
        camera_angle=args.camera_angle,
        calibration_seconds=args.calibration_seconds,
        skip_after_calibration_seconds=args.skip_after_calibration_seconds,
        max_test_seconds=args.max_test_seconds,
        user_age=args.user_age,
        user_sex=args.user_sex,
        min_usable_frame_ratio=args.min_usable_frame_ratio,
        output_json=Path(args.output_json) if args.output_json else None,
        debug_csv=Path(args.debug_csv) if args.debug_csv else None,
    )

    validate_config(config)
    return config


def validate_config(config: ValidationConfig) -> None:
    if config.expected_reps < 0:
        raise ValueError("--expected-reps cannot be negative.")

    if config.calibration_seconds <= 0:
        raise ValueError("--calibration-seconds must be greater than 0.")

    if config.skip_after_calibration_seconds < 0:
        raise ValueError("--skip-after-calibration-seconds cannot be negative.")

    if config.max_test_seconds <= 0:
        raise ValueError("--max-test-seconds must be greater than 0.")

    if not 0 <= config.min_usable_frame_ratio <= 1:
        raise ValueError("--min-usable-frame-ratio must be between 0 and 1.")


def bgr_to_rgb(frame):
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def model_to_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()

    if hasattr(model, "dict"):
        return model.dict()

    return dict(model)


def get_video_metadata(capture: cv2.VideoCapture) -> VideoMetadata:
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)

    if fps <= 0:
        fps = 30.0

    return VideoMetadata(
        fps=fps,
        total_frame_count=int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0),
        width=int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
        height=int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
    )


def get_phase(
    timestamp_ms: float,
    calibration_end_ms: float,
    test_start_ms: float,
    test_end_ms: float,
) -> str:
    if timestamp_ms < calibration_end_ms:
        return "calibration"

    if timestamp_ms < test_start_ms:
        return "post_calibration_skip"

    if timestamp_ms <= test_end_ms:
        return "test"

    return "after_test_window"


def decide_pass(
    *,
    status: ValidationStatus,
    expected_validity: ExpectedValidity,
    expected_reps: int,
    predicted_reps: int | None,
) -> bool:
    if expected_validity == "invalid_input":
        return status in REJECTION_STATUSES

    if status != "completed":
        return False

    return predicted_reps == expected_reps


def explain_failure(
    *,
    passed: bool,
    status: ValidationStatus,
    expected_validity: ExpectedValidity,
    expected_reps: int,
    predicted_reps: int | None,
) -> str | None:
    if passed:
        return None

    if expected_validity == "invalid_input" and status == "completed":
        return (
            "Validator accepted an invalid/no-human video as a normal completed test. "
            "This is dangerous because bad input could be mistaken as a valid 0-rep result."
        )

    if expected_validity != "invalid_input" and status in REJECTION_STATUSES:
        return (
            f"Video was expected to be processable as {expected_validity}, "
            f"but validator rejected it with status={status}."
        )

    if status == "completed" and predicted_reps != expected_reps:
        return (
            f"Rep count mismatch. Expected {expected_reps}, "
            f"but ChairStandStrategy predicted {predicted_reps}."
        )

    return f"Validation failed with status={status}."


def make_result(
    *,
    config: ValidationConfig,
    status: ValidationStatus,
    counters: FrameCounters,
    metadata: VideoMetadata,
    predicted_reps: int | None,
    calibration_ok: bool,
    calibration_error: str | None,
    final_posture: str | None,
    final_angle: float | None,
    outcome: dict[str, Any] | None,
) -> ValidationResult:
    usable_frame_ratio = (
        counters.usable_pose_frames / counters.frames_read
        if counters.frames_read > 0
        else 0.0
    )

    passed = decide_pass(
        status=status,
        expected_validity=config.expected_validity,
        expected_reps=config.expected_reps,
        predicted_reps=predicted_reps,
    )

    failure_reason = explain_failure(
        passed=passed,
        status=status,
        expected_validity=config.expected_validity,
        expected_reps=config.expected_reps,
        predicted_reps=predicted_reps,
    )

    return ValidationResult(
        video=str(config.video_path),
        scenario=config.scenario,
        camera_angle=config.camera_angle,
        expected_validity=config.expected_validity,
        expected_reps=config.expected_reps,
        predicted_reps=predicted_reps,
        passed=passed,
        status=status,
        failure_reason=failure_reason,
        calibration_ok=calibration_ok,
        calibration_error=calibration_error,
        usable_frame_ratio=round(usable_frame_ratio, 4),
        final_posture=final_posture,
        final_angle=final_angle,
        metadata=asdict(metadata),
        counters=asdict(counters),
        outcome=outcome,
    )


def save_outputs(
    *,
    config: ValidationConfig,
    result: ValidationResult,
    debug_rows: list[dict[str, Any]],
) -> None:
    if config.output_json:
        config.output_json.parent.mkdir(parents=True, exist_ok=True)
        config.output_json.write_text(
            json.dumps(asdict(result), indent=2),
            encoding="utf-8",
        )

    if config.debug_csv:
        config.debug_csv.parent.mkdir(parents=True, exist_ok=True)

        with config.debug_csv.open("w", newline="", encoding="utf-8") as file:
            fieldnames = [
                "frame_index",
                "timestamp_ms",
                "phase",
                "detection",
                "posture",
                "angle",
                "reps",
                "event",
            ]

            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(debug_rows)


def validate_video(config: ValidationConfig) -> ValidationResult:
    counters = FrameCounters()
    debug_rows: list[dict[str, Any]] = []

    if not config.video_path.exists():
        metadata = VideoMetadata(fps=0, total_frame_count=0, width=0, height=0)
        return make_result(
            config=config,
            status="invalid_video",
            counters=counters,
            metadata=metadata,
            predicted_reps=None,
            calibration_ok=False,
            calibration_error=f"Video file does not exist: {config.video_path}",
            final_posture=None,
            final_angle=None,
            outcome=None,
        )

    capture = cv2.VideoCapture(str(config.video_path))

    if not capture.isOpened():
        metadata = VideoMetadata(fps=0, total_frame_count=0, width=0, height=0)
        return make_result(
            config=config,
            status="invalid_video",
            counters=counters,
            metadata=metadata,
            predicted_reps=None,
            calibration_ok=False,
            calibration_error=f"Could not open video: {config.video_path}",
            final_posture=None,
            final_angle=None,
            outcome=None,
        )

    metadata = get_video_metadata(capture)

    strategy = ChairStandStrategy()
    smoother = LandmarkSmoother()

    strategy.reset()
    smoother.reset()
    detector.init()

    calibration_ok = False
    calibration_error: str | None = None
    calibration_finished = False

    predicted_reps: int | None = 0
    previous_reps = 0
    final_posture: str | None = None
    final_angle: float | None = None
    outcome: dict[str, Any] | None = None

    calibration_end_ms = config.calibration_seconds * 1000.0
    test_start_ms = calibration_end_ms + config.skip_after_calibration_seconds * 1000.0
    test_end_ms = test_start_ms + config.max_test_seconds * 1000.0

    try:
        while True:
            ok, frame = capture.read()

            if not ok:
                break

            frame_index = counters.frames_read
            timestamp_ms = frame_index * 1000.0 / metadata.fps
            phase = get_phase(
                timestamp_ms=timestamp_ms,
                calibration_end_ms=calibration_end_ms,
                test_start_ms=test_start_ms,
                test_end_ms=test_end_ms,
            )

            counters.frames_read += 1

            if phase == "after_test_window":
                break

            rgb = bgr_to_rgb(frame)
            raw_landmarks = detector.detect(rgb)

            if raw_landmarks is None:
                counters.missing_pose_frames += 1

                debug_rows.append(
                    {
                        "frame_index": frame_index,
                        "timestamp_ms": round(timestamp_ms, 2),
                        "phase": phase,
                        "detection": "missing",
                        "posture": final_posture,
                        "angle": final_angle,
                        "reps": predicted_reps,
                        "event": "no_pose_detected",
                    }
                )

                continue

            counters.frames_with_pose += 1

            landmarks = smoother.smooth(raw_landmarks, timestamp_ms)
            detection = strategy.detection_for(landmarks)

            if detection == "ok":
                counters.usable_pose_frames += 1
            else:
                counters.partial_pose_frames += 1

            event = ""

            if phase == "calibration":
                if strategy.is_frame_usable(landmarks):
                    strategy.on_calibration_frame(landmarks)
                    counters.calibration_frames_used += 1

                debug_rows.append(
                    {
                        "frame_index": frame_index,
                        "timestamp_ms": round(timestamp_ms, 2),
                        "phase": phase,
                        "detection": detection,
                        "posture": final_posture,
                        "angle": final_angle,
                        "reps": predicted_reps,
                        "event": "calibration_sample"
                        if detection == "ok"
                        else "calibration_partial_pose",
                    }
                )

                continue

            if not calibration_finished:
                calibration_ok, calibration_error = strategy.finish_calibration()
                calibration_finished = True

                if not calibration_ok:
                    break

            if phase != "test":
                continue

            counters.test_frames_seen += 1

            if not strategy.is_frame_usable(landmarks):
                debug_rows.append(
                    {
                        "frame_index": frame_index,
                        "timestamp_ms": round(timestamp_ms, 2),
                        "phase": phase,
                        "detection": detection,
                        "posture": final_posture,
                        "angle": final_angle,
                        "reps": predicted_reps,
                        "event": "test_partial_pose",
                    }
                )

                continue

            update = strategy.update(
                landmarks=landmarks,
                elapsed_ms=timestamp_ms - test_start_ms,
            )

            counters.test_frames_used += 1
            counters.strategy_updates_applied += 1

            predicted_reps = update.reps
            final_posture = update.posture
            final_angle = update.angle

            if predicted_reps is not None and predicted_reps > previous_reps:
                counters.rep_increment_events += 1
                event = "rep_incremented"

            previous_reps = predicted_reps or previous_reps

            debug_rows.append(
                {
                    "frame_index": frame_index,
                    "timestamp_ms": round(timestamp_ms, 2),
                    "phase": phase,
                    "detection": detection,
                    "posture": final_posture,
                    "angle": round(final_angle, 4) if final_angle is not None else None,
                    "reps": predicted_reps,
                    "event": event,
                }
            )

    finally:
        capture.release()
        detector.close()

    if counters.frames_read == 0:
        status: ValidationStatus = "invalid_video"

    elif counters.frames_with_pose == 0:
        status = "no_pose_detected"

    else:
        if not calibration_finished:
            calibration_ok, calibration_error = strategy.finish_calibration()
            calibration_finished = True

        if not calibration_ok:
            status = "calibration_failed"

        elif counters.strategy_updates_applied == 0:
            status = "insufficient_test_signal"

        else:
            final = strategy.finalize(
                FinalizeContext(
                    user_age=config.user_age,
                    user_sex=config.user_sex,
                    terminated_early=False,
                )
            )

            outcome = model_to_dict(final)
            predicted_reps = final.reps

            usable_frame_ratio = counters.usable_pose_frames / counters.frames_read

            if usable_frame_ratio < config.min_usable_frame_ratio:
                status = "low_detection_quality"
            else:
                status = "completed"

    result = make_result(
        config=config,
        status=status,
        counters=counters,
        metadata=metadata,
        predicted_reps=predicted_reps,
        calibration_ok=calibration_ok,
        calibration_error=calibration_error,
        final_posture=final_posture,
        final_angle=final_angle,
        outcome=outcome,
    )

    save_outputs(config=config, result=result, debug_rows=debug_rows)
    return result


def main() -> None:
    try:
        config = parse_args()
        result = validate_video(config)

        print(json.dumps(asdict(result), indent=2))

        sys.exit(0 if result.passed else 1)

    except Exception as exc:
        error_result = {
            "passed": False,
            "status": "runtime_error",
            "failure_reason": str(exc),
        }

        print(json.dumps(error_result, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()