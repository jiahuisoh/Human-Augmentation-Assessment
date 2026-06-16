import math
import statistics
from collections import deque
from typing import Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, angle_between, distance, pick_better_side
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy
from app.tests.sit_reach.norms import classify_sit_reach
LEG_LENGTH_FRACTION_OF_HEIGHT = 0.53
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 10
_MIN_KNEE_ANGLE = 155.0
HOLD_SECONDS = 2.5
_HOLD_MS = HOLD_SECONDS * 1000.0
_MIN_HOLD_FRAMES = 8
_HOLD_MAX_STDEV_CM = 4.0
_LIVE_SMOOTH_FRAMES = 5
_SMOOTHER_MIN_CUTOFF = 0.9
_SMOOTHER_BETA = 0.02
_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)
_LEFT_KNEE = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE)
_RIGHT_KNEE = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)


def forward_unit(hip: Landmark, ankle: Landmark, toe: Landmark) -> tuple[float, float]:
    ax, ay = ankle.x - hip.x, ankle.y - hip.y
    leg_len = math.hypot(ax, ay)
    if leg_len == 0:
        return (1.0, 0.0)
    ux, uy = ax / leg_len, ay / leg_len
    perp_a = (-uy, ux)
    perp_b = (uy, -ux)
    tx, ty = toe.x - hip.x, toe.y - hip.y
    if tx * perp_a[0] + ty * perp_a[1] >= tx * perp_b[0] + ty * perp_b[1]:
        return perp_a
    return perp_b


def forward_offset(point: Landmark, origin: Landmark, fwd: tuple[float, float]) -> float:
    dx, dy = point.x - origin.x, point.y - origin.y
    return dx * fwd[0] + dy * fwd[1]


def forward_reach_norm(finger: Landmark, toe: Landmark, fwd: tuple[float, float]) -> float:
    dx, dy = finger.x - toe.x, finger.y - toe.y
    return dx * fwd[0] + dy * fwd[1]


def reach_from_baseline(finger: Landmark, hip: Landmark, fwd: tuple[float, float], toe_baseline_offset: float) -> float:
    return forward_offset(finger, hip, fwd) - toe_baseline_offset


class SitReachStrategy(TestStrategy):
    test_id = 'sit_reach'
    calibration_s = 3
    countdown_s = 3
    active_duration_s = 30
    min_calibration_samples = _MIN_CALIB_SAMPLES
    requires_hands = True
    calibration_prompt = 'Sit sideways to the camera with your test leg straight out.'

    def __init__(self) -> None:
        self._user_height_cm: float | None = None
        self._leg_samples: list[float] = []
        self._toe_baseline_offsets: list[float] = []
        self._cm_per_unit: float | None = None
        self._toe_baseline_offset: float | None = None
        self._calibration_quality: float | None = None
        self._forward: tuple[float, float] | None = None
        self._best_side: str = 'right'
        self._samples: deque[tuple[float, float]] = deque()
        self._frames_scored: int = 0
        self._best_held_cm: float | None = None
        self._best_seen_cm: float | None = None
        self._last_reach_cm: float | None = None

    def reset(self) -> None:
        self._leg_samples.clear()
        self._toe_baseline_offsets.clear()
        self._cm_per_unit = None
        self._toe_baseline_offset = None
        self._calibration_quality = None
        self._forward = None
        self._best_side = 'right'
        self._samples.clear()
        self._frames_scored = 0
        self._best_held_cm = None
        self._best_seen_cm = None
        self._last_reach_cm = None

    def on_init(self, user_age: int | None, user_sex: Sex, user_height: float | None) -> None:
        _ = (user_age, user_sex)
        self._user_height_cm = user_height

    def smoother_config(self) -> tuple[float, float]:
        return (_SMOOTHER_MIN_CUTOFF, _SMOOTHER_BETA)

    def get_calibration_quality(self) -> float | None:
        if self._calibration_quality is not None:
            return self._calibration_quality
        if len(self._leg_samples) >= 2:
            return self._compute_calibration_quality()
        return None

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        side, _ = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        self._best_side = side
        idx_leg = _LEFT_LEG if side == 'left' else _RIGHT_LEG
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if side == 'left' else LANDMARK.RIGHT_HIP
        if not all_visible(landmarks, (*idx_leg, idx_foot)):
            return
        hip, ankle, toe = landmarks[idx_hip], landmarks[idx_leg[1]], landmarks[idx_foot]
        leg_len = distance(hip, ankle)
        if leg_len <= 0:
            return
        self._leg_samples.append(leg_len)
        fwd = forward_unit(hip, ankle, toe)
        self._toe_baseline_offsets.append(forward_offset(toe, hip, fwd))

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._leg_samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not see your leg clearly. Sit sideways to the camera with your test leg fully visible.')
        if self._user_height_cm is None or self._user_height_cm <= 0:
            return (False, 'No height on file for this client. Add their height to their profile, then retry.')
        median_leg = statistics.median(self._leg_samples)
        leg_length_cm = self._user_height_cm * LEG_LENGTH_FRACTION_OF_HEIGHT
        self._cm_per_unit = leg_length_cm / median_leg
        self._toe_baseline_offset = statistics.median(self._toe_baseline_offsets)
        self._calibration_quality = self._compute_calibration_quality()
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        if self._cm_per_unit is None or self._toe_baseline_offset is None:
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        if not self._knee_is_straight(landmarks, self._best_side):
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if self._best_side == 'left' else LANDMARK.RIGHT_HIP
        idx_ankle = LANDMARK.LEFT_ANKLE if self._best_side == 'left' else LANDMARK.RIGHT_ANKLE
        if not all_visible(landmarks, (idx_foot, idx_hip, idx_ankle)):
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        hip = landmarks[idx_hip]
        ankle = landmarks[idx_ankle]
        toe = landmarks[idx_foot]
        self._forward = forward_unit(hip, ankle, toe)
        finger = self._reach_fingertip(landmarks, hand_landmarks, toe)
        if finger is None:
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        reach_norm = reach_from_baseline(finger, hip, self._forward, self._toe_baseline_offset)
        raw_cm = round(reach_norm * self._cm_per_unit, 1)
        self._frames_scored += 1

        self._samples.append((elapsed_ms, raw_cm))
        cutoff = elapsed_ms - _HOLD_MS
        while len(self._samples) >= 2 and self._samples[1][0] < cutoff:
            self._samples.popleft()
        reaches = [r for _, r in self._samples]

        live = round(statistics.median(reaches[-_LIVE_SMOOTH_FRAMES:]), 1)
        self._last_reach_cm = live
        self._best_seen_cm = live if self._best_seen_cm is None else max(self._best_seen_cm, live)

        span_ms = self._samples[-1][0] - self._samples[0][0]
        if span_ms >= _HOLD_MS and len(reaches) >= _MIN_HOLD_FRAMES and statistics.pstdev(reaches) <= _HOLD_MAX_STDEV_CM:
            held = round(statistics.median(reaches), 1)
            self._best_held_cm = held if self._best_held_cm is None else max(self._best_held_cm, held)

        return TestStateUpdate(measurement=live, best_measurement=self._best_held_cm)

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        if self._frames_scored < _MIN_TEST_SAMPLES:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early, calibration_quality=self._calibration_quality)
        best = self._best_held_cm if self._best_held_cm is not None else self._best_seen_cm
        if best is None:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early, calibration_quality=self._calibration_quality)
        classification = classify_sit_reach(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, calibration_quality=self._calibration_quality)
        interpretation = classification.interpretation
        if self._calibration_quality is not None and self._calibration_quality < 0.5:
            interpretation = f'{interpretation} Low calibration confidence — clinician review recommended.'
        return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, classification=classification.classification, risk_level=classification.risk_level, interpretation=interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high, calibration_quality=self._calibration_quality)

    def _compute_calibration_quality(self) -> float:
        leg_mean = statistics.mean(self._leg_samples)
        leg_std = statistics.stdev(self._leg_samples) if len(self._leg_samples) > 1 else 0.0
        leg_cv = leg_std / leg_mean if leg_mean > 0 else 1.0
        leg_score = max(0.0, min(1.0, 1.0 - leg_cv * 8.0))
        toe_std = statistics.stdev(self._toe_baseline_offsets) if len(self._toe_baseline_offsets) > 1 else 0.0
        toe_score = max(0.0, min(1.0, 1.0 - toe_std * 20.0))
        sample_score = min(1.0, len(self._leg_samples) / 8.0)
        return round(0.45 * leg_score + 0.35 * toe_score + 0.20 * sample_score, 2)

    def _knee_is_straight(self, landmarks: Sequence[Landmark], side: str) -> bool:
        idx = _LEFT_KNEE if side == 'left' else _RIGHT_KNEE
        if not all_visible(landmarks, idx):
            return False
        angle = angle_between(landmarks[idx[0]], landmarks[idx[1]], landmarks[idx[2]])
        return angle >= _MIN_KNEE_ANGLE

    def _reach_fingertip(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None, toe: Landmark) -> Landmark | None:
        if hand_landmarks and self._forward is not None:
            best: Landmark | None = None
            best_reach: float | None = None
            for hand in hand_landmarks:
                if len(hand) <= HAND_LANDMARK.MIDDLE_FINGER_TIP:
                    continue
                tip = hand[HAND_LANDMARK.MIDDLE_FINGER_TIP]
                reach = forward_reach_norm(tip, toe, self._forward)
                if best_reach is None or reach > best_reach:
                    best = tip
                    best_reach = reach
            if best is not None:
                return best
        idx = LANDMARK.LEFT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_INDEX
        if all_visible(landmarks, (idx,)):
            return landmarks[idx]
        return None
