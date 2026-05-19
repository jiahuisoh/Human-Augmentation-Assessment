import statistics
from typing import Sequence
from app.cv.landmarks import LANDMARK, all_visible, distance, pick_better_side
from app.cv.types import Landmark, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy
from app.tests.sit_reach.norms import classify_sit_reach
_ASSUMED_LEG_LENGTH_CM = 90.0
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 10
_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)

class SitReachStrategy(TestStrategy):
    test_id = 'sit_reach'
    calibration_s = 3
    countdown_s = 3
    active_duration_s = 30
    min_calibration_samples = _MIN_CALIB_SAMPLES
    calibration_prompt = 'Sit sideways to the camera with your test leg straight out.'

    def __init__(self) -> None:
        self._leg_samples: list[float] = []
        self._cm_per_unit: float | None = None
        self._best_side: str = 'right'
        self._reach_cm: float | None = None
        self._all_reaches: list[float] = []

    def reset(self) -> None:
        self._leg_samples.clear()
        self._cm_per_unit = None
        self._best_side = 'right'
        self._reach_cm = None
        self._all_reaches.clear()

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        side, _ = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        self._best_side = side
        idx = _LEFT_LEG if side == 'left' else _RIGHT_LEG
        if not all_visible(landmarks, idx):
            return
        leg_len = distance(landmarks[idx[0]], landmarks[idx[1]])
        if leg_len > 0:
            self._leg_samples.append(leg_len)

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._leg_samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not see your leg clearly. Sit sideways to the camera with your test leg fully visible.')
        median_leg = statistics.median(self._leg_samples)
        self._cm_per_unit = _ASSUMED_LEG_LENGTH_CM / median_leg
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        _ = hand_landmarks
        if self._cm_per_unit is None:
            return TestStateUpdate(measurement=self._reach_cm)
        idx_finger = LANDMARK.LEFT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_INDEX
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if self._best_side == 'left' else LANDMARK.RIGHT_HIP
        if not all_visible(landmarks, (idx_finger, idx_foot, idx_hip)):
            return TestStateUpdate(measurement=self._reach_cm, best_measurement=max(self._all_reaches) if self._all_reaches else None)
        finger = landmarks[idx_finger]
        toe = landmarks[idx_foot]
        hip = landmarks[idx_hip]
        forward_sign = 1.0 if toe.x - hip.x >= 0 else -1.0
        cm = round((finger.x - toe.x) * forward_sign * self._cm_per_unit, 1)
        self._reach_cm = cm
        self._all_reaches.append(cm)
        return TestStateUpdate(measurement=cm, best_measurement=max(self._all_reaches))

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        if len(self._all_reaches) < _MIN_TEST_SAMPLES:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early)
        best = max(self._all_reaches)
        classification = classify_sit_reach(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early)
        return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, classification=classification.classification, risk_level=classification.risk_level, interpretation=classification.interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high)
