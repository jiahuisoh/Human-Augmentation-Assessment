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

from app.cv.hand_detector import hand_detector
from app.cv.landmark_smoother import LandmarkSmoother
from app.cv.pose_detector import detector
from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import SitReachStrategy
from validation.synthda.model_paths import ensure_models


ExpectedValidity = Literal['valid_movement', 'invalid_movement', 'invalid_input']

ValidationStatus = Literal[
    'completed',
    'invalid_video',
    'no_pose_detected',
    'calibration_failed',
    'insufficient_test_signal',
    'low_detection_quality',
    'runtime_error',
]

REJECTION_STATUSES: set[str] = {
    'invalid_video',
    'no_pose_detected',
    'calibration_failed',
    'insufficient_test_signal',
    'low_detection_quality',
}


@dataclass(frozen=True)
class ValidationConfig:
    video_path: Path
    expected_reach_cm: float
    expected_validity: ExpectedValidity
    scenario: str
    camera_angle: str
    calibration_seconds: float
    countdown_seconds: float
    max_test_seconds: float
    user_age: int
    user_sex: str
    user_height_cm: float
    reach_tolerance_cm: float
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
    reach_record_events: int = 0


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
    expected_reach_cm: float
    predicted_reach_cm: float | None
    reach_error_cm: float | None
    passed: bool
    status: ValidationStatus
    failure_reason: str | None
    calibration_ok: bool
    calibration_error: str | None
    usable_frame_ratio: float
    calibration_quality: float | None
    metadata: dict[str, Any]
    counters: dict[str, int]
    outcome: dict[str, Any] | None


def parse_args() -> ValidationConfig:
    parser = argparse.ArgumentParser(
        description=(
            'Stress-test sit-reach CV logic against a local video (SynthDa export or recording). '
            'Matches the chair-stand validation harness pattern in cv-service/tools/.'
        ),
    )
    parser.add_argument('--video', required=True, help='Path to video file.')
    parser.add_argument('--expected-reach-cm', type=float, required=True, help='Ground-truth reach in cm.')
    parser.add_argument(
        '--expected-validity',
        choices=['valid_movement', 'invalid_movement', 'invalid_input'],
        required=True,
        help='valid_movement = score should match label; invalid_input = reject video.',
    )
    parser.add_argument('--scenario', required=True, help='e.g. full_reach, bent_knee, no_person.')
    parser.add_argument('--camera-angle', default='side', help='e.g. side, front, unknown.')
    parser.add_argument('--calibration-seconds', type=float, default=3.0)
    parser.add_argument('--countdown-seconds', type=float, default=3.0)
    parser.add_argument('--max-test-seconds', type=float, default=30.0)
    parser.add_argument('--user-age', type=int, default=70)
    parser.add_argument('--user-sex', choices=['male', 'female', 'other'], default='other')
    parser.add_argument('--user-height-cm', type=float, default=165.0)
    parser.add_argument('--reach-tolerance-cm', type=float, default=3.0)
    parser.add_argument('--min-usable-frame-ratio', type=float, default=0.20)
    parser.add_argument('--output-json', default=None)
    parser.add_argument('--debug-csv', default=None)
    args = parser.parse_args()

    config = ValidationConfig(
        video_path=Path(args.video),
        expected_reach_cm=args.expected_reach_cm,
        expected_validity=args.expected_validity,
        scenario=args.scenario,
        camera_angle=args.camera_angle,
        calibration_seconds=args.calibration_seconds,
        countdown_seconds=args.countdown_seconds,
        max_test_seconds=args.max_test_seconds,
        user_age=args.user_age,
        user_sex=args.user_sex,
        user_height_cm=args.user_height_cm,
        reach_tolerance_cm=args.reach_tolerance_cm,
        min_usable_frame_ratio=args.min_usable_frame_ratio,
        output_json=Path(args.output_json) if args.output_json else None,
        debug_csv=Path(args.debug_csv) if args.debug_csv else None,
    )
    validate_config(config)
    return config


def validate_config(config: ValidationConfig) -> None:
    if config.calibration_seconds <= 0:
        raise ValueError('--calibration-seconds must be greater than 0.')
    if config.countdown_seconds < 0:
        raise ValueError('--countdown-seconds cannot be negative.')
    if config.max_test_seconds <= 0:
        raise ValueError('--max-test-seconds must be greater than 0.')
    if config.reach_tolerance_cm < 0:
        raise ValueError('--reach-tolerance-cm cannot be negative.')
    if not 0 <= config.min_usable_frame_ratio <= 1:
        raise ValueError('--min-usable-frame-ratio must be between 0 and 1.')


def bgr_to_rgb(frame):
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def model_to_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, 'model_dump'):
        return model.model_dump()
    if hasattr(model, 'dict'):
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
    countdown_end_ms: float,
    test_end_ms: float,
) -> str:
    if timestamp_ms < calibration_end_ms:
        return 'calibration'
    if timestamp_ms < countdown_end_ms:
        return 'countdown'
    if timestamp_ms <= test_end_ms:
        return 'test'
    return 'after_test_window'


def decide_pass(
    *,
    status: ValidationStatus,
    expected_validity: ExpectedValidity,
    expected_reach_cm: float,
    predicted_reach_cm: float | None,
    reach_tolerance_cm: float,
) -> bool:
    if expected_validity == 'invalid_input':
        return status in REJECTION_STATUSES

    if status != 'completed':
        return False

    if predicted_reach_cm is None:
        return False

    return abs(predicted_reach_cm - expected_reach_cm) <= reach_tolerance_cm


def explain_failure(
    *,
    passed: bool,
    status: ValidationStatus,
    expected_validity: ExpectedValidity,
    expected_reach_cm: float,
    predicted_reach_cm: float | None,
    reach_tolerance_cm: float,
) -> str | None:
    if passed:
        return None

    if expected_validity == 'invalid_input' and status == 'completed':
        return 'Validator accepted invalid/no-human video as a completed test.'

    if expected_validity != 'invalid_input' and status in REJECTION_STATUSES:
        return f'Expected processable video but got status={status}.'

    if status == 'completed' and predicted_reach_cm is not None:
        err = abs(predicted_reach_cm - expected_reach_cm)
        if err > reach_tolerance_cm:
            return (
                f'Reach mismatch. Expected {expected_reach_cm:.1f} cm (+/- {reach_tolerance_cm}), '
                f'got {predicted_reach_cm:.1f} cm (error {err:.1f} cm).'
            )

    return f'Validation failed with status={status}.'


def make_result(
    *,
    config: ValidationConfig,
    status: ValidationStatus,
    counters: FrameCounters,
    metadata: VideoMetadata,
    predicted_reach_cm: float | None,
    calibration_ok: bool,
    calibration_error: str | None,
    calibration_quality: float | None,
    outcome: dict[str, Any] | None,
) -> ValidationResult:
    usable_frame_ratio = (
        counters.usable_pose_frames / counters.frames_read if counters.frames_read > 0 else 0.0
    )
    reach_error = (
        round(predicted_reach_cm - config.expected_reach_cm, 2)
        if predicted_reach_cm is not None
        else None
    )
    passed = decide_pass(
        status=status,
        expected_validity=config.expected_validity,
        expected_reach_cm=config.expected_reach_cm,
        predicted_reach_cm=predicted_reach_cm,
        reach_tolerance_cm=config.reach_tolerance_cm,
    )
    failure_reason = explain_failure(
        passed=passed,
        status=status,
        expected_validity=config.expected_validity,
        expected_reach_cm=config.expected_reach_cm,
        predicted_reach_cm=predicted_reach_cm,
        reach_tolerance_cm=config.reach_tolerance_cm,
    )
    return ValidationResult(
        video=str(config.video_path),
        scenario=config.scenario,
        camera_angle=config.camera_angle,
        expected_validity=config.expected_validity,
        expected_reach_cm=config.expected_reach_cm,
        predicted_reach_cm=predicted_reach_cm,
        reach_error_cm=reach_error,
        passed=passed,
        status=status,
        failure_reason=failure_reason,
        calibration_ok=calibration_ok,
        calibration_error=calibration_error,
        usable_frame_ratio=round(usable_frame_ratio, 4),
        calibration_quality=calibration_quality,
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
        config.output_json.write_text(json.dumps(asdict(result), indent=2), encoding='utf-8')

    if config.debug_csv:
        config.debug_csv.parent.mkdir(parents=True, exist_ok=True)
        with config.debug_csv.open('w', newline='', encoding='utf-8') as file:
            fieldnames = [
                'frame_index',
                'timestamp_ms',
                'phase',
                'detection',
                'measurement',
                'best_measurement',
                'form_hint',
                'event',
            ]
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(debug_rows)


def validate_video(config: ValidationConfig) -> ValidationResult:
    counters = FrameCounters()
    debug_rows: list[dict[str, Any]] = []
    empty_meta = VideoMetadata(fps=0, total_frame_count=0, width=0, height=0)

    if not config.video_path.exists():
        return make_result(
            config=config,
            status='invalid_video',
            counters=counters,
            metadata=empty_meta,
            predicted_reach_cm=None,
            calibration_ok=False,
            calibration_error=f'Video file does not exist: {config.video_path}',
            calibration_quality=None,
            outcome=None,
        )

    ensure_models()
    capture = cv2.VideoCapture(str(config.video_path))
    if not capture.isOpened():
        return make_result(
            config=config,
            status='invalid_video',
            counters=counters,
            metadata=empty_meta,
            predicted_reach_cm=None,
            calibration_ok=False,
            calibration_error=f'Could not open video: {config.video_path}',
            calibration_quality=None,
            outcome=None,
        )

    metadata = get_video_metadata(capture)
    strategy = SitReachStrategy()
    smoother = LandmarkSmoother()
    strategy.reset()
    strategy.on_init(None, config.user_sex, config.user_height_cm)
    mc, beta = strategy.smoother_config()
    smoother = LandmarkSmoother(min_cutoff=mc, beta=beta)
    detector.init()
    hand_detector.init()

    calibration_ok = False
    calibration_error: str | None = None
    calibration_finished = False
    predicted_reach_cm: float | None = None
    calibration_quality: float | None = None
    recorded_reaches_before = 0
    outcome: dict[str, Any] | None = None

    calib_end_ms = config.calibration_seconds * 1000.0
    countdown_end_ms = calib_end_ms + config.countdown_seconds * 1000.0
    test_end_ms = countdown_end_ms + config.max_test_seconds * 1000.0

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            frame_index = counters.frames_read
            timestamp_ms = frame_index * 1000.0 / metadata.fps
            phase = get_phase(timestamp_ms, calib_end_ms, countdown_end_ms, test_end_ms)
            counters.frames_read += 1

            if phase == 'after_test_window':
                break

            rgb = bgr_to_rgb(frame)
            raw_landmarks = detector.detect(rgb)
            hands = hand_detector.detect(rgb)

            if raw_landmarks is None:
                counters.missing_pose_frames += 1
                debug_rows.append({
                    'frame_index': frame_index,
                    'timestamp_ms': round(timestamp_ms, 2),
                    'phase': phase,
                    'detection': 'missing',
                    'measurement': None,
                    'best_measurement': None,
                    'form_hint': None,
                    'event': 'no_pose_detected',
                })
                continue

            counters.frames_with_pose += 1
            landmarks = smoother.smooth(raw_landmarks, timestamp_ms)
            detection = strategy.detection_for(landmarks)

            if detection == 'ok':
                counters.usable_pose_frames += 1
            else:
                counters.partial_pose_frames += 1

            if phase == 'calibration':
                if strategy.is_frame_usable(landmarks):
                    strategy.on_calibration_frame(landmarks, hands)
                    counters.calibration_frames_used += 1
                debug_rows.append({
                    'frame_index': frame_index,
                    'timestamp_ms': round(timestamp_ms, 2),
                    'phase': phase,
                    'detection': detection,
                    'measurement': None,
                    'best_measurement': None,
                    'form_hint': strategy.form_hint_for(landmarks, 'calibrating'),
                    'event': 'calibration_sample' if detection == 'ok' else 'calibration_partial_pose',
                })
                continue

            if phase == 'countdown':
                debug_rows.append({
                    'frame_index': frame_index,
                    'timestamp_ms': round(timestamp_ms, 2),
                    'phase': phase,
                    'detection': detection,
                    'measurement': None,
                    'best_measurement': None,
                    'form_hint': None,
                    'event': 'countdown',
                })
                continue

            if not calibration_finished:
                calibration_ok, calibration_error = strategy.finish_calibration()
                calibration_finished = True
                calibration_quality = strategy.get_calibration_quality()
                if not calibration_ok:
                    break

            counters.test_frames_seen += 1
            if not strategy.is_frame_usable(landmarks):
                debug_rows.append({
                    'frame_index': frame_index,
                    'timestamp_ms': round(timestamp_ms, 2),
                    'phase': phase,
                    'detection': detection,
                    'measurement': predicted_reach_cm,
                    'best_measurement': None,
                    'form_hint': None,
                    'event': 'test_partial_pose',
                })
                continue

            elapsed_test_ms = timestamp_ms - countdown_end_ms
            update = strategy.update(landmarks, elapsed_test_ms, hands)
            counters.test_frames_used += 1
            counters.strategy_updates_applied += 1
            predicted_reach_cm = update.measurement
            if len(strategy._all_reaches) > recorded_reaches_before:
                counters.reach_record_events += 1
                recorded_reaches_before = len(strategy._all_reaches)

            debug_rows.append({
                'frame_index': frame_index,
                'timestamp_ms': round(timestamp_ms, 2),
                'phase': phase,
                'detection': detection,
                'measurement': update.measurement,
                'best_measurement': update.best_measurement,
                'form_hint': update.form_hint,
                'event': 'reach_recorded' if counters.reach_record_events > recorded_reaches_before - 1 else '',
            })

    finally:
        capture.release()
        detector.close()
        hand_detector.close()

    status: ValidationStatus
    if counters.frames_read == 0:
        status = 'invalid_video'
    elif counters.frames_with_pose == 0:
        status = 'no_pose_detected'
    else:
        if not calibration_finished:
            calibration_ok, calibration_error = strategy.finish_calibration()
            calibration_finished = True
            calibration_quality = strategy.get_calibration_quality()

        if not calibration_ok:
            status = 'calibration_failed'
        elif counters.strategy_updates_applied == 0:
            status = 'insufficient_test_signal'
        else:
            final = strategy.finalize(
                FinalizeContext(
                    user_age=config.user_age,
                    user_sex=config.user_sex,
                    terminated_early=False,
                ),
            )
            outcome = model_to_dict(final)
            predicted_reach_cm = final.measurement
            calibration_quality = final.calibration_quality
            usable_frame_ratio = counters.usable_pose_frames / counters.frames_read
            if usable_frame_ratio < config.min_usable_frame_ratio:
                status = 'low_detection_quality'
            else:
                status = 'completed'

    result = make_result(
        config=config,
        status=status,
        counters=counters,
        metadata=metadata,
        predicted_reach_cm=predicted_reach_cm,
        calibration_ok=calibration_ok,
        calibration_error=calibration_error,
        calibration_quality=calibration_quality,
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
        print(json.dumps({'passed': False, 'status': 'runtime_error', 'failure_reason': str(exc)}, indent=2))
        sys.exit(2)


if __name__ == '__main__':
    main()
