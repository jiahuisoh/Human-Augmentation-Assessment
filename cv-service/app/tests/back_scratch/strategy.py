import math
import statistics
from typing import Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, distance
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy
from app.tests.back_scratch.norms import classify_back_scratch
SHOULDER_WIDTH_FRACTION_OF_HEIGHT = 0.259
ASSUMED_HEIGHT_CM = 165.0
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 10
_SHOULDERS = (LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER)
_PINKIES = (LANDMARK.LEFT_PINKY, LANDMARK.RIGHT_PINKY)

class BackScratchStrategy(TestStrategy):
    test_id = 'back_scratch'
    calibration_s = 3
    countdown_s = 3
    active_duration_s = 30
    min_calibration_samples = _MIN_CALIB_SAMPLES
    requires_hands = True
    calibration_prompt = 'Stand FACING the camera with arms at your sides for calibration. When the test starts, you can stand sideways if it helps the hand tracker see your fingers.'

    def __init__(self) -> None:
        self._user_height_cm: float | None = None
        self._shoulder_samples: list[float] = []
        self._cm_per_unit: float | None = None
        self._gaps_cm: list[float] = []
        self._last_gap_cm: float | None = None

    def reset(self) -> None:
        self._shoulder_samples.clear()
        self._cm_per_unit = None
        self._gaps_cm.clear()
        self._last_gap_cm = None

    def on_init(
        self,
        user_age: int | None,
        user_sex: Sex,
        user_height: float | None,
        environment: str = 'home',
        seating: str = 'chair',
    ) -> None:
        _ = (user_age, user_sex, environment, seating)
        self._user_height_cm = user_height

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _SHOULDERS)

    def get_calibration_sample_count(self) -> int:
        return len(self._shoulder_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        if not all_visible(landmarks, _SHOULDERS):
            return
        w = distance(landmarks[LANDMARK.LEFT_SHOULDER], landmarks[LANDMARK.RIGHT_SHOULDER])
        if w > 0:
            self._shoulder_samples.append(w)

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._shoulder_samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not see your shoulders. Face the camera with your full upper body in frame.')
        median_shoulder_width_norm = statistics.median(self._shoulder_samples)
        height_cm = self._user_height_cm or ASSUMED_HEIGHT_CM
        actual_shoulder_width_cm = height_cm * SHOULDER_WIDTH_FRACTION_OF_HEIGHT
        self._cm_per_unit = actual_shoulder_width_cm / median_shoulder_width_norm
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        if self._cm_per_unit is None:
            return TestStateUpdate(measurement=self._last_gap_cm)
        tip_a, tip_b = self._fingertips(landmarks, hand_landmarks)
        if tip_a is None or tip_b is None:
            return TestStateUpdate(measurement=self._last_gap_cm, best_measurement=self._best_gap_cm())
        dx = tip_a.x - tip_b.x
        dy = tip_a.y - tip_b.y
        gap_norm = math.hypot(dx, dy)
        gap_cm = round(gap_norm * self._cm_per_unit, 1)
        self._last_gap_cm = gap_cm
        self._gaps_cm.append(gap_cm)
        return TestStateUpdate(measurement=gap_cm, best_measurement=self._best_gap_cm())

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        if len(self._gaps_cm) < _MIN_TEST_SAMPLES:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early)
        best_gap_cm = min(self._gaps_cm)
        signed_score = -best_gap_cm
        classification = classify_back_scratch(signed_score, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=signed_score, terminated_early=ctx.terminated_early)
        return TestOutcome(measurement=signed_score, terminated_early=ctx.terminated_early, classification=classification.classification, risk_level=classification.risk_level, interpretation=classification.interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high)

    def _best_gap_cm(self) -> float | None:
        return min(self._gaps_cm) if self._gaps_cm else None

    def _fingertips(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None) -> tuple[Landmark | None, Landmark | None]:
        if hand_landmarks and len(hand_landmarks) >= 2:
            return (hand_landmarks[0][HAND_LANDMARK.MIDDLE_FINGER_TIP], hand_landmarks[1][HAND_LANDMARK.MIDDLE_FINGER_TIP])
        if all_visible(landmarks, _PINKIES):
            return (landmarks[LANDMARK.LEFT_PINKY], landmarks[LANDMARK.RIGHT_PINKY])
        return (None, None)
