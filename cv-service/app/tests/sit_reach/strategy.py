import math
import statistics
from collections import deque
from typing import Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, angle_between, distance, pick_better_side
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy, calibration_quality_from_samples
from app.tests.sit_reach.norms import classify_sit_reach, traffic_light_for_reach

# Body-segment lengths as fractions of stature H (Drillis & Contini 1966, as
# reproduced in Winter, "Biomechanics and Motor Control of Human Movement").
# Hip (greater trochanter) height is 0.530 H measured to the FLOOR, and the
# lateral malleolus sits 0.039 H above the floor. We calibrate against the
# MediaPipe hip->ankle segment, so the correct fraction is the difference
# between the two, NOT 0.530: using 0.530 here inflated every measurement by
# ~8% (0.530 / 0.491).
HIP_HEIGHT_FRACTION_OF_HEIGHT = 0.530
ANKLE_HEIGHT_FRACTION_OF_HEIGHT = 0.039
LEG_LENGTH_FRACTION_OF_HEIGHT = HIP_HEIGHT_FRACTION_OF_HEIGHT - ANKLE_HEIGHT_FRACTION_OF_HEIGHT

_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 10
HOLD_SECONDS = 2.5
_HOLD_MS = HOLD_SECONDS * 1000.0
_MIN_HOLD_FRAMES = 8
_HOLD_MAX_STDEV_CM = 4.0
_LIVE_SMOOTH_FRAMES = 5
_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)
# Hip-knee-ankle, for the knee-extension check.
_LEFT_LEG_FULL = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG_FULL = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)
# The protocol requires the extended knee to stay straight: bending it lets the
# hands travel further without any gain in hamstring length, which is exactly
# the cheat the test is designed to exclude. Flag it - never auto-void the
# trial, that judgement belongs to the clinician.
_MIN_STRAIGHT_KNEE_DEG = 172.0


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
        # (elapsed_ms, reach_cm, knee_angle_deg | None)
        self._samples: deque[tuple[float, float, float | None]] = deque()
        self._frames_scored: int = 0
        self._best_held_cm: float | None = None
        self._best_seen_cm: float | None = None
        self._last_reach_cm: float | None = None
        self._knee_offsets: list[float] = []
        # Whether the knee was bent during the window that produced the score.
        self._best_held_knee_bent: bool | None = None
        self._live_knee_bent: bool | None = None

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
        self._knee_offsets.clear()
        self._best_held_knee_bent = None
        self._live_knee_bent = None

    def on_init(self, user_age: int | None, user_sex: Sex, user_height: float | None) -> None:
        _ = (user_age, user_sex)
        self._user_height_cm = user_height

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def get_calibration_quality(self) -> float | None:
        return calibration_quality_from_samples(self._leg_samples)

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
        raw_cm = round(reach_norm * self._cm_per_unit, 1)
        self._frames_scored += 1

        idx_knee = LANDMARK.LEFT_KNEE if self._best_side == 'left' else LANDMARK.RIGHT_KNEE
        if all_visible(landmarks, (idx_knee,)):
            knee_offset = forward_reach_norm(landmarks[idx_knee], toe, self._forward)
            self._knee_offsets.append(knee_offset * self._cm_per_unit)

        knee_angle = self._knee_angle(landmarks)
        self._live_knee_bent = None if knee_angle is None else knee_angle < _MIN_STRAIGHT_KNEE_DEG

        self._samples.append((elapsed_ms, raw_cm, knee_angle))
        cutoff = elapsed_ms - _HOLD_MS
        while len(self._samples) >= 2 and self._samples[1][0] < cutoff:
            self._samples.popleft()
        reaches = [r for _, r, _k in self._samples]

        live = round(statistics.median(reaches[-_LIVE_SMOOTH_FRAMES:]), 1)
        self._last_reach_cm = live
        self._best_seen_cm = live if self._best_seen_cm is None else max(self._best_seen_cm, live)

        span_ms = self._samples[-1][0] - self._samples[0][0]
        if span_ms >= _HOLD_MS and len(reaches) >= _MIN_HOLD_FRAMES and statistics.pstdev(reaches) <= _HOLD_MAX_STDEV_CM:
            held = round(statistics.median(reaches), 1)
            if self._best_held_cm is None or held > self._best_held_cm:
                self._best_held_cm = held
                # Record straightness for THIS window: the flag must describe
                # the hold that produced the score, not the whole test.
                self._best_held_knee_bent = self._window_knee_bent()

        return TestStateUpdate(measurement=live, best_measurement=self._best_held_cm, knee_bent=self._live_knee_bent)

    def _window_knee_bent(self) -> bool | None:
        angles = [k for _, _, k in self._samples if k is not None]
        if not angles:
            return None
        return min(angles) < _MIN_STRAIGHT_KNEE_DEG

    def _knee_angle(self, landmarks: Sequence[Landmark]) -> float | None:
        idx = _LEFT_LEG_FULL if self._best_side == 'left' else _RIGHT_LEG_FULL
        if not all_visible(landmarks, idx):
            return None
        return angle_between(landmarks[idx[0]], landmarks[idx[1]], landmarks[idx[2]])

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        # measurement stays None when nothing was scored: 0.0 cm is a real
        # result (fingertips exactly at the toes), not a "no data" sentinel.
        if self._frames_scored < _MIN_TEST_SAMPLES:
            return TestOutcome(terminated_early=ctx.terminated_early)
        best = self._best_held_cm if self._best_held_cm is not None else self._best_seen_cm
        if best is None:
            return TestOutcome(terminated_early=ctx.terminated_early)
        knee_offset_cm = round(statistics.median(self._knee_offsets), 1) if self._knee_offsets else None
        traffic_light = traffic_light_for_reach(best, knee_offset_cm)
        classification = classify_sit_reach(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, traffic_light=traffic_light, knee_offset_cm=knee_offset_cm, knee_bent=self._best_held_knee_bent)
        return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, traffic_light=traffic_light, knee_offset_cm=knee_offset_cm, knee_bent=self._best_held_knee_bent, classification=classification.classification, risk_level=classification.risk_level, interpretation=classification.interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high, norm_applicability=classification.norm_applicability)

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
