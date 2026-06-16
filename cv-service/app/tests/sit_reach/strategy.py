import math
import statistics
from collections import deque
from typing import Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, distance, pick_better_side
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy
from app.tests.sit_reach.norms import classify_sit_reach
LEG_LENGTH_FRACTION_OF_HEIGHT = 0.53
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 10
HOLD_SECONDS = 2.5
_HOLD_MS = HOLD_SECONDS * 1000.0
_MIN_HOLD_FRAMES = 8
_HOLD_MAX_STDEV_CM = 4.0
_LIVE_SMOOTH_FRAMES = 5
_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)


def forward_unit(hip: Landmark, ankle: Landmark) -> tuple[float, float]:
    ax, ay = ankle.x - hip.x, ankle.y - hip.y
    leg_len = math.hypot(ax, ay)
    if leg_len == 0:
        return (1.0, 0.0)
    return (ax / leg_len, ay / leg_len)


def forward_reach_norm(finger: Landmark, toe: Landmark, fwd: tuple[float, float]) -> float:
    dx, dy = finger.x - toe.x, finger.y - toe.y
    return dx * fwd[0] + dy * fwd[1]


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
        self._cm_per_unit: float | None = None
        self._forward: tuple[float, float] | None = None
        self._best_side: str = 'right'
        self._samples: deque[tuple[float, float]] = deque()
        self._frames_scored: int = 0
        self._best_held_cm: float | None = None
        self._best_seen_cm: float | None = None
        self._last_reach_cm: float | None = None

    def reset(self) -> None:
        self._leg_samples.clear()
        self._cm_per_unit = None
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

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        side, _ = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        self._best_side = side
        idx_leg = _LEFT_LEG if side == 'left' else _RIGHT_LEG
        if not all_visible(landmarks, idx_leg):
            return
        leg_len = distance(landmarks[idx_leg[0]], landmarks[idx_leg[1]])
        if leg_len > 0:
            self._leg_samples.append(leg_len)

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._leg_samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not see your leg clearly. Sit sideways to the camera with your test leg fully visible.')
        if self._user_height_cm is None or self._user_height_cm <= 0:
            return (False, 'No height on file for this client. Add their height to their profile, then retry.')
        median_leg = statistics.median(self._leg_samples)
        leg_length_cm = self._user_height_cm * LEG_LENGTH_FRACTION_OF_HEIGHT
        self._cm_per_unit = leg_length_cm / median_leg
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        if self._cm_per_unit is None:
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if self._best_side == 'left' else LANDMARK.RIGHT_HIP
        idx_ankle = LANDMARK.LEFT_ANKLE if self._best_side == 'left' else LANDMARK.RIGHT_ANKLE
        if not all_visible(landmarks, (idx_foot, idx_hip, idx_ankle)):
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        hip = landmarks[idx_hip]
        ankle = landmarks[idx_ankle]
        toe = landmarks[idx_foot]
        self._forward = forward_unit(hip, ankle)
        finger = self._reach_fingertip(landmarks, hand_landmarks, toe)
        if finger is None:
            return TestStateUpdate(measurement=self._last_reach_cm, best_measurement=self._best_held_cm)
        reach_norm = forward_reach_norm(finger, toe, self._forward)
        raw_cm = round(-reach_norm * self._cm_per_unit, 1)
        self._frames_scored += 1

        self._samples.append((elapsed_ms, raw_cm))
        cutoff = elapsed_ms - _HOLD_MS
        while len(self._samples) >= 2 and self._samples[1][0] < cutoff:
            self._samples.popleft()
        reaches = [r for _, r in self._samples]

        live = round(statistics.median(reaches[-_LIVE_SMOOTH_FRAMES:]), 1)
        self._last_reach_cm = live
        self._best_seen_cm = live if self._best_seen_cm is None else min(self._best_seen_cm, live)

        span_ms = self._samples[-1][0] - self._samples[0][0]
        if span_ms >= _HOLD_MS and len(reaches) >= _MIN_HOLD_FRAMES and statistics.pstdev(reaches) <= _HOLD_MAX_STDEV_CM:
            held = round(statistics.median(reaches), 1)
            self._best_held_cm = held if self._best_held_cm is None else min(self._best_held_cm, held)

        return TestStateUpdate(measurement=live, best_measurement=self._best_held_cm)

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        if self._frames_scored < _MIN_TEST_SAMPLES:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early)
        best = self._best_held_cm if self._best_held_cm is not None else self._best_seen_cm
        if best is None:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early)
        classification = classify_sit_reach(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early)
        return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, classification=classification.classification, risk_level=classification.risk_level, interpretation=classification.interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high)

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
