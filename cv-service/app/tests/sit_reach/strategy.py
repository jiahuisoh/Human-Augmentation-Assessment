import statistics
from typing import Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, angle_between, distance, pick_better_side
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy
from app.tests.sit_reach.norms import classify_sit_reach

LEG_LENGTH_FRACTION_OF_HEIGHT = 0.47
ASSUMED_HEIGHT_CM = 165.0
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 3
_MIN_KNEE_ANGLE = 155.0
_OUTLIER_CM = 12.0
_HOLD_MS = 2000.0
_STABLE_CM = 2.5
_RETRACT_CM = 3.0
_TOP_N_MEDIAN = 5

_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)
_LEFT_KNEE = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE)
_RIGHT_KNEE = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)


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
        self._best_side: str = 'right'
        self._reach_cm: float | None = None
        self._all_reaches: list[float] = []
        self._hold_anchor_ms: float | None = None
        self._hold_anchor_cm: float | None = None
        self._hold_recorded = False

    def reset(self) -> None:
        self._leg_samples.clear()
        self._cm_per_unit = None
        self._best_side = 'right'
        self._reach_cm = None
        self._all_reaches.clear()
        self._hold_anchor_ms = None
        self._hold_anchor_cm = None
        self._hold_recorded = False

    def on_init(self, user_age: int | None, user_sex: Sex, user_height: float | None) -> None:
        _ = (user_age, user_sex)
        self._user_height_cm = user_height

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None = None) -> None:
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
        self._cm_per_unit = self._leg_length_cm() / median_leg
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None = None) -> TestStateUpdate:
        if self._cm_per_unit is None:
            return TestStateUpdate(measurement=self._reach_cm, best_measurement=self._robust_best())
        if not self._knee_is_straight(landmarks, self._best_side):
            return TestStateUpdate(measurement=self._reach_cm, best_measurement=self._robust_best())

        idx_foot = LANDMARK.LEFT_FOOT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if self._best_side == 'left' else LANDMARK.RIGHT_HIP
        if not all_visible(landmarks, (idx_foot, idx_hip)):
            return TestStateUpdate(measurement=self._reach_cm, best_measurement=self._robust_best())

        hip = landmarks[idx_hip]
        toe = landmarks[idx_foot]
        forward_sign = 1.0 if toe.x - hip.x >= 0 else -1.0
        finger = self._finger_landmark(landmarks, hand_landmarks, forward_sign)
        if finger is None:
            return TestStateUpdate(measurement=self._reach_cm, best_measurement=self._robust_best())

        cm = round((finger.x - toe.x) * forward_sign * self._cm_per_unit, 1)
        self._reach_cm = cm
        self._maybe_record_reach(cm, elapsed_ms)
        return TestStateUpdate(measurement=cm, best_measurement=self._robust_best())

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        if not self._all_reaches:
            return TestOutcome(measurement=0.0, terminated_early=ctx.terminated_early)
        best = self._robust_best() or 0.0
        if len(self._all_reaches) < _MIN_TEST_SAMPLES:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early)
        classification = classify_sit_reach(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early)
        return TestOutcome(
            measurement=best,
            terminated_early=ctx.terminated_early,
            classification=classification.classification,
            risk_level=classification.risk_level,
            interpretation=classification.interpretation,
            norm_low=classification.norm_low,
            norm_high=classification.norm_high,
        )

    def _leg_length_cm(self) -> float:
        height_cm = self._user_height_cm or ASSUMED_HEIGHT_CM
        return height_cm * LEG_LENGTH_FRACTION_OF_HEIGHT

    def _knee_is_straight(self, landmarks: Sequence[Landmark], side: str) -> bool:
        idx = _LEFT_KNEE if side == 'left' else _RIGHT_KNEE
        if not all_visible(landmarks, idx):
            return False
        angle = angle_between(landmarks[idx[0]], landmarks[idx[1]], landmarks[idx[2]])
        return angle >= _MIN_KNEE_ANGLE

    def _finger_landmark(
        self,
        landmarks: Sequence[Landmark],
        hand_landmarks: Sequence[Sequence[Landmark]] | None,
        forward_sign: float,
    ) -> Landmark | None:
        if hand_landmarks:
            best: Landmark | None = None
            best_score: float | None = None
            for hand in hand_landmarks:
                tip = hand[HAND_LANDMARK.MIDDLE_FINGER_TIP]
                score = forward_sign * tip.x
                if best_score is None or score > best_score:
                    best = tip
                    best_score = score
            if best is not None:
                return best
        idx = LANDMARK.LEFT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_INDEX
        if all_visible(landmarks, (idx,)):
            return landmarks[idx]
        return None

    def _maybe_record_reach(self, cm: float, elapsed_ms: float) -> None:
        if self._hold_recorded and self._all_reaches and cm < max(self._all_reaches) - _RETRACT_CM:
            self._start_hold(cm, elapsed_ms)
        if self._hold_anchor_cm is None or abs(cm - self._hold_anchor_cm) > _STABLE_CM:
            self._start_hold(cm, elapsed_ms)
            return
        if self._hold_recorded or self._hold_anchor_ms is None:
            return
        if elapsed_ms - self._hold_anchor_ms < _HOLD_MS:
            return
        if self._is_outlier(cm):
            self._hold_recorded = True
            return
        self._all_reaches.append(cm)
        self._hold_recorded = True

    def _start_hold(self, cm: float, elapsed_ms: float) -> None:
        self._hold_anchor_cm = cm
        self._hold_anchor_ms = elapsed_ms
        self._hold_recorded = False

    def _is_outlier(self, cm: float) -> bool:
        if len(self._all_reaches) < 2:
            return False
        recent = statistics.median(self._all_reaches[-5:])
        return abs(cm - recent) > _OUTLIER_CM

    def _robust_best(self) -> float | None:
        if not self._all_reaches:
            return None
        top = sorted(self._all_reaches, reverse=True)[:_TOP_N_MEDIAN]
        return round(statistics.median(top), 1)
