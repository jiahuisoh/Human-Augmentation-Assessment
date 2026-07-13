import statistics
from typing import Sequence
from app.cv.landmarks import LANDMARK, all_visible, angle_between, pick_better_side
from app.cv.types import Landmark, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy, calibration_quality_from_samples
from app.tests.chair_stand.norms import classify_chair_stand
_STAND_GAP_DOWN = 35
_STAND_GAP_UP = 10
_MIN_CALIB_SAMPLES = 3
_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)

class ChairStandStrategy(TestStrategy):
    test_id = 'chair_stand'
    calibration_s = 3
    countdown_s = 3
    active_duration_s = 30
    min_calibration_samples = _MIN_CALIB_SAMPLES
    calibration_prompt = "Stand straight, sideways to the camera. We're measuring your standing posture."

    def __init__(self) -> None:
        self._samples: list[float] = []
        self._standing_baseline: float | None = None
        self._posture: str = 'unknown'
        self._reps: int = 0

    def reset(self) -> None:
        self._samples.clear()
        self._standing_baseline = None
        self._posture = 'unknown'
        self._reps = 0

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return self._hip_angle(landmarks) is not None

    def get_calibration_sample_count(self) -> int:
        return len(self._samples)

    def get_calibration_quality(self) -> float | None:
        return calibration_quality_from_samples(self._samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        angle = self._hip_angle(landmarks)
        if angle is not None:
            self._samples.append(angle)

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not detect your full body. Step back so your hip, knee, and ankle are all visible from the side.')
        self._standing_baseline = statistics.median(self._samples)
        self._posture = 'up'
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        _ = hand_landmarks
        angle = self._hip_angle(landmarks)
        if angle is None or self._standing_baseline is None:
            return TestStateUpdate(reps=self._reps, posture=self._posture, angle=None)
        down_at = self._standing_baseline - _STAND_GAP_DOWN
        up_at = self._standing_baseline - _STAND_GAP_UP
        if self._posture != 'down' and angle < down_at:
            self._posture = 'down'
        elif self._posture == 'down' and angle > up_at:
            self._posture = 'up'
            self._reps += 1
        return TestStateUpdate(reps=self._reps, posture=self._posture, angle=angle)

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        classification = classify_chair_stand(self._reps, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(reps=self._reps, terminated_early=ctx.terminated_early)
        return TestOutcome(reps=self._reps, terminated_early=ctx.terminated_early, classification=classification.classification, risk_level=classification.risk_level, interpretation=classification.interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high)

    def _hip_angle(self, landmarks: Sequence[Landmark]) -> float | None:
        side, _ = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        idx = _LEFT_LEG if side == 'left' else _RIGHT_LEG
        if not all_visible(landmarks, idx):
            return None
        return angle_between(landmarks[idx[0]], landmarks[idx[1]], landmarks[idx[2]])
