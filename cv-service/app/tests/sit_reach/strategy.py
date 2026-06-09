import math
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
_MIN_KNEE_ANGLE = 160.0
_MAX_KNEE_LINE_DEV = 0.10
_MAX_FOOT_LIFT = 0.12
_OUTLIER_CM = 12.0
_HOLD_MS = 2000.0
_STABLE_CM = 2.5
_RETRACT_CM = 3.0
_TOP_N_MEDIAN = 5
_SMOOTHER_MIN_CUTOFF = 0.9
_SMOOTHER_BETA = 0.02

_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)
_LEFT_KNEE = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE)
_RIGHT_KNEE = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)

HINT_KNEE_BENT = "Keep your test leg straight — bent knee won't count"
HINT_LEG_ALIGN = "Align hip, knee, and ankle in one line"
HINT_FOOT_FLAT = "Keep your heel and foot flat on the floor"
HINT_LEG_VISIBLE = "Keep your test leg fully visible from the side"


def forward_unit(hip: Landmark, ankle: Landmark, toe: Landmark) -> tuple[float, float]:
    """Unit vector perpendicular to the leg axis, pointing toward the toes."""
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
    """Signed reach distance in normalised units along the forward axis (0 at toe)."""
    dx, dy = finger.x - toe.x, finger.y - toe.y
    return dx * fwd[0] + dy * fwd[1]


def reach_from_baseline(finger: Landmark, hip: Landmark, fwd: tuple[float, float], toe_baseline_offset: float) -> float:
    """Reach along forward axis relative to the toe baseline captured at calibration."""
    return forward_offset(finger, hip, fwd) - toe_baseline_offset


def point_line_distance(point: Landmark, line_a: Landmark, line_b: Landmark) -> float:
    ax, ay = line_b.x - line_a.x, line_b.y - line_a.y
    denom = ax * ax + ay * ay
    if denom == 0:
        return distance(point, line_a)
    t = max(0.0, min(1.0, ((point.x - line_a.x) * ax + (point.y - line_a.y) * ay) / denom))
    proj_x = line_a.x + t * ax
    proj_y = line_a.y + t * ay
    return math.hypot(point.x - proj_x, point.y - proj_y)


class SitReachStrategy(TestStrategy):
    test_id = 'sit_reach'
    calibration_s = 3
    countdown_s = 3
    active_duration_s = 30
    min_calibration_samples = _MIN_CALIB_SAMPLES
    requires_hands = True
    calibration_prompt = 'Sit sideways with your test leg straight, heel down, and foot flat.'

    def __init__(self) -> None:
        self._user_height_cm: float | None = None
        self._leg_samples: list[float] = []
        self._toe_baseline_offsets: list[float] = []
        self._cm_per_unit: float | None = None
        self._forward: tuple[float, float] | None = None
        self._toe_baseline_offset: float | None = None
        self._calibration_quality: float | None = None
        self._best_side: str = 'right'
        self._reach_cm: float | None = None
        self._all_reaches: list[float] = []
        self._hold_anchor_ms: float | None = None
        self._hold_anchor_cm: float | None = None
        self._hold_recorded = False

    def reset(self) -> None:
        self._leg_samples.clear()
        self._toe_baseline_offsets.clear()
        self._cm_per_unit = None
        self._forward = None
        self._toe_baseline_offset = None
        self._calibration_quality = None
        self._best_side = 'right'
        self._reach_cm = None
        self._all_reaches.clear()
        self._hold_anchor_ms = None
        self._hold_anchor_cm = None
        self._hold_recorded = False

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

    def form_hint_for(self, landmarks: Sequence[Landmark] | None, phase: str) -> str | None:
        if landmarks is None or phase not in ('calibrating', 'test'):
            return None
        side, _ = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        return self._evaluate_leg_form(landmarks, side)

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None = None) -> None:
        _ = hand_landmarks
        side, _ = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        self._best_side = side
        if self._evaluate_leg_form(landmarks, side) is not None:
            return
        idx_leg = _LEFT_LEG if side == 'left' else _RIGHT_LEG
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if side == 'left' else LANDMARK.RIGHT_HIP
        hip, ankle, toe = landmarks[idx_hip], landmarks[idx_leg[1]], landmarks[idx_foot]
        leg_len = distance(hip, ankle)
        if leg_len <= 0:
            return
        self._leg_samples.append(leg_len)
        fwd = forward_unit(hip, ankle, toe)
        self._toe_baseline_offsets.append(forward_offset(toe, hip, fwd))

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._leg_samples) < _MIN_CALIB_SAMPLES:
            return (
                False,
                'Could not calibrate with a straight leg. Sit sideways, keep your knee straight, heel down, and foot flat.',
            )
        median_leg = statistics.median(self._leg_samples)
        self._cm_per_unit = self._leg_length_cm() / median_leg
        self._toe_baseline_offset = statistics.median(self._toe_baseline_offsets)
        self._calibration_quality = self._compute_calibration_quality()
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None = None) -> TestStateUpdate:
        best = self._robust_best()
        if self._cm_per_unit is None or self._toe_baseline_offset is None:
            return TestStateUpdate(measurement=self._reach_cm, best_measurement=best)

        hint = self._evaluate_leg_form(landmarks, self._best_side)
        if hint is not None:
            return TestStateUpdate(measurement=None, best_measurement=best, form_hint=hint)

        idx_foot = LANDMARK.LEFT_FOOT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if self._best_side == 'left' else LANDMARK.RIGHT_HIP
        idx_ankle = LANDMARK.LEFT_ANKLE if self._best_side == 'left' else LANDMARK.RIGHT_ANKLE
        hip = landmarks[idx_hip]
        ankle = landmarks[idx_ankle]
        toe = landmarks[idx_foot]
        self._forward = forward_unit(hip, ankle, toe)
        finger = self._finger_landmark(landmarks, hand_landmarks, toe)
        if finger is None:
            return TestStateUpdate(measurement=None, best_measurement=best)

        reach_norm = reach_from_baseline(finger, hip, self._forward, self._toe_baseline_offset)
        cm = round(reach_norm * self._cm_per_unit, 1)
        self._reach_cm = cm
        self._maybe_record_reach(cm, elapsed_ms)
        return TestStateUpdate(measurement=cm, best_measurement=self._robust_best())

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        if not self._all_reaches:
            return TestOutcome(
                measurement=0.0,
                terminated_early=ctx.terminated_early,
                calibration_quality=self._calibration_quality,
            )
        best = self._robust_best() or 0.0
        low_calib = self._calibration_quality is not None and self._calibration_quality < 0.5
        if len(self._all_reaches) < _MIN_TEST_SAMPLES:
            return TestOutcome(
                measurement=best,
                terminated_early=ctx.terminated_early,
                calibration_quality=self._calibration_quality,
            )
        classification = classify_sit_reach(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(
                measurement=best,
                terminated_early=ctx.terminated_early,
                calibration_quality=self._calibration_quality,
            )
        interpretation = classification.interpretation
        if low_calib:
            interpretation = f'{interpretation} Low calibration confidence — clinician review recommended.'
        return TestOutcome(
            measurement=best,
            terminated_early=ctx.terminated_early,
            classification=classification.classification,
            risk_level=classification.risk_level,
            interpretation=interpretation,
            norm_low=classification.norm_low,
            norm_high=classification.norm_high,
            calibration_quality=self._calibration_quality,
        )

    def _evaluate_leg_form(self, landmarks: Sequence[Landmark], side: str) -> str | None:
        idx_knee = _LEFT_KNEE if side == 'left' else _RIGHT_KNEE
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        if not all_visible(landmarks, (*idx_knee, idx_foot)):
            return HINT_LEG_VISIBLE

        hip, knee, ankle = landmarks[idx_knee[0]], landmarks[idx_knee[1]], landmarks[idx_knee[2]]
        toe = landmarks[idx_foot]
        leg_len = distance(hip, ankle)
        if leg_len <= 0:
            return HINT_LEG_VISIBLE

        knee_angle = angle_between(hip, knee, ankle)
        if point_line_distance(knee, hip, ankle) / leg_len > _MAX_KNEE_LINE_DEV:
            return HINT_LEG_ALIGN

        if knee_angle < _MIN_KNEE_ANGLE:
            return HINT_KNEE_BENT

        if abs(toe.y - ankle.y) / leg_len > _MAX_FOOT_LIFT:
            return HINT_FOOT_FLAT

        fwd = forward_unit(hip, ankle, toe)
        if forward_offset(ankle, hip, fwd) > forward_offset(toe, hip, fwd) + leg_len * 0.03:
            return HINT_FOOT_FLAT

        return None

    def _leg_length_cm(self) -> float:
        height_cm = self._user_height_cm or ASSUMED_HEIGHT_CM
        return height_cm * LEG_LENGTH_FRACTION_OF_HEIGHT

    def _compute_calibration_quality(self) -> float:
        leg_mean = statistics.mean(self._leg_samples)
        leg_std = statistics.stdev(self._leg_samples) if len(self._leg_samples) > 1 else 0.0
        leg_cv = leg_std / leg_mean if leg_mean > 0 else 1.0
        leg_score = max(0.0, min(1.0, 1.0 - leg_cv * 8.0))

        toe_std = statistics.stdev(self._toe_baseline_offsets) if len(self._toe_baseline_offsets) > 1 else 0.0
        toe_score = max(0.0, min(1.0, 1.0 - toe_std * 20.0))

        sample_score = min(1.0, len(self._leg_samples) / 8.0)
        return round(0.45 * leg_score + 0.35 * toe_score + 0.20 * sample_score, 2)

    def _finger_landmark(
        self,
        landmarks: Sequence[Landmark],
        hand_landmarks: Sequence[Sequence[Landmark]] | None,
        toe: Landmark,
    ) -> Landmark | None:
        if hand_landmarks and self._forward is not None:
            best: Landmark | None = None
            best_reach: float | None = None
            for hand in hand_landmarks:
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
