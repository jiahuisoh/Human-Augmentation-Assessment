import math
import statistics
from dataclasses import dataclass
from typing import Literal, Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, angle_between, avg_visibility, distance
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy
from app.tests.sit_reach.norms import classify_chair_sit_reach_position, classify_sit_reach

LEG_LENGTH_FRACTION_OF_HEIGHT = 0.47
ASSUMED_HEIGHT_CM = 165.0
# FOOT_INDEX is the tip; people usually touch slightly behind that (shoe top / toe pads).
# Pull the zero back along ankle→toe so "touching toes" reads nearer 0 cm.
TOE_LINE_BACK_FRACTION = 0.45
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 3
_OUTLIER_CM = 12.0
_HOLD_MS = 3000.0
_STABLE_CM = 2.5
_RETRACT_CM = 3.0
_TOP_N_MEDIAN = 5
_SMOOTHER_MIN_CUTOFF = 0.9
_SMOOTHER_BETA = 0.02
_GAMIFICATION_TARGET_CM = 35.0

_LEFT_LEG = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE)
_RIGHT_LEG = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE)
_LEFT_KNEE = (LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE)
_RIGHT_KNEE = (LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE)

HINT_KNEE_BENT = 'Keep your test leg straight — bent knee won\'t count'
HINT_LEG_ALIGN = 'Align hip, knee, and ankle in one line'
HINT_FOOT_FLAT = 'Keep your heel down (toes may point up)'
HINT_LEG_VISIBLE = 'Keep your test leg fully visible from the side'

FormEnvironment = Literal['home', 'clinic']
SeatingMode = Literal['chair', 'floor']
MeasurementConfidence = Literal['high', 'low', 'practice_only']

STATUS_REACH_STAR = 'Reach for the star at your toes!'
STATUS_HOLD_STEADY = 'Hold steady!'
STATUS_SCORE_LOCKED = 'Score locked!'
STATUS_PAUSED_PREFIX = 'Recording paused'

CHAIR_CALIBRATION_PROMPT = (
    'Sit on the front of a chair in side view (profile) to the camera. '
    'Keep hips–knee–ankle–toes of the extended leg and both hands in frame. '
    'One foot flat; test leg heel down, knee straight. Face does not need to be visible.'
)
# Floor: both legs extended, heels at toe line (classic floor sit-and-reach).
FLOOR_CALIBRATION_PROMPT = (
    'Sit on the floor in side view (profile) to the camera. '
    'Keep hips–knees–ankles–toes and both hands in frame. '
    'Both legs extended, heels down, knees straight. Face does not need to be visible.'
)


@dataclass(frozen=True)
class FormThresholds:
    min_knee_angle: float
    max_knee_line_dev: float
    max_foot_lift: float


THRESHOLDS: dict[FormEnvironment, FormThresholds] = {
    'clinic': FormThresholds(min_knee_angle=160.0, max_knee_line_dev=0.10, max_foot_lift=0.18),
    'home': FormThresholds(min_knee_angle=150.0, max_knee_line_dev=0.14, max_foot_lift=0.22),
}


def forward_unit(hip: Landmark, ankle: Landmark, toe: Landmark) -> tuple[float, float]:
    """Unit vector along the leg axis, pointing toward the toes (side-view reach direction)."""
    ax, ay = ankle.x - hip.x, ankle.y - hip.y
    leg_len = math.hypot(ax, ay)
    if leg_len == 0:
        tx, ty = toe.x - hip.x, toe.y - hip.y
        toe_len = math.hypot(tx, ty)
        if toe_len == 0:
            return (1.0, 0.0)
        return (tx / toe_len, ty / toe_len)
    ux, uy = ax / leg_len, ay / leg_len
    # Ensure forward points toward the toes, not back toward the hip.
    if (toe.x - hip.x) * ux + (toe.y - hip.y) * uy < 0:
        return (-ux, -uy)
    return (ux, uy)


def forward_offset(point: Landmark, origin: Landmark, fwd: tuple[float, float]) -> float:
    dx, dy = point.x - origin.x, point.y - origin.y
    return dx * fwd[0] + dy * fwd[1]


def forward_reach_norm(finger: Landmark, toe: Landmark, fwd: tuple[float, float]) -> float:
    """Signed reach distance in normalised units along the forward axis (0 at toe)."""
    dx, dy = finger.x - toe.x, finger.y - toe.y
    return dx * fwd[0] + dy * fwd[1]


def reach_from_baseline(finger: Landmark, hip: Landmark, fwd: tuple[float, float], toe_baseline_offset: float) -> float:
    """Reach along forward axis relative to a toe baseline offset from hip (tests / legacy)."""
    return forward_offset(finger, hip, fwd) - toe_baseline_offset


def toe_line_landmark(ankle: Landmark, toe: Landmark) -> Landmark:
    """Zero line for scoring: between ankle and FOOT_INDEX tip (closer to contact surface)."""
    return Landmark(
        x=toe.x + (ankle.x - toe.x) * TOE_LINE_BACK_FRACTION,
        y=toe.y + (ankle.y - toe.y) * TOE_LINE_BACK_FRACTION,
        visibility=min(ankle.visibility, toe.visibility),
    )


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
    calibration_prompt = CHAIR_CALIBRATION_PROMPT

    def __init__(self) -> None:
        self._user_height_cm: float | None = None
        self._environment: FormEnvironment = 'home'
        self._seating: SeatingMode = 'chair'
        self._thresholds: FormThresholds = THRESHOLDS['home']
        self._leg_samples: list[float] = []
        self._toe_baseline_offsets: list[float] = []
        self._cm_per_unit: float | None = None
        self._forward: tuple[float, float] | None = None
        self._toe_baseline_offset: float | None = None
        self._calibration_quality: float | None = None
        self._best_side: str = 'right'
        self._valid_reach_cm: float | None = None
        self._raw_reach_cm: float | None = None
        self._raw_best_cm: float | None = None
        self._all_reaches: list[float] = []
        self._hold_anchor_ms: float | None = None
        self._hold_anchor_cm: float | None = None
        self._hold_recorded = False
        self._last_hold_progress: float = 0.0
        self._last_recording_status: str | None = None
        self._best_past_knee: bool = False
        self._had_valid_form: bool = False

    def reset(self) -> None:
        self._leg_samples.clear()
        self._toe_baseline_offsets.clear()
        self._cm_per_unit = None
        self._forward = None
        self._toe_baseline_offset = None
        self._calibration_quality = None
        self._best_side = 'right'
        self._valid_reach_cm = None
        self._raw_reach_cm = None
        self._raw_best_cm = None
        self._all_reaches.clear()
        self._hold_anchor_ms = None
        self._hold_anchor_cm = None
        self._hold_recorded = False
        self._last_hold_progress = 0.0
        self._last_recording_status = None
        self._best_past_knee = False
        self._had_valid_form = False

    def on_init(
        self,
        user_age: int | None,
        user_sex: Sex,
        user_height: float | None,
        environment: str = 'home',
        seating: str = 'chair',
    ) -> None:
        _ = (user_age, user_sex)
        self._user_height_cm = user_height
        self._environment = environment if environment in THRESHOLDS else 'home'
        self._thresholds = THRESHOLDS[self._environment]
        self._seating = seating if seating in ('chair', 'floor') else 'chair'
        self.calibration_prompt = (
            FLOOR_CALIBRATION_PROMPT if self._seating == 'floor' else CHAIR_CALIBRATION_PROMPT
        )

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
        return self._form_hint_for_seating(landmarks)

    def _form_hint_for_seating(self, landmarks: Sequence[Landmark]) -> str | None:
        if self._seating == 'floor':
            # Floor mode: both knees should stay extended when visible.
            for check_side in ('left', 'right'):
                idx = _LEFT_LEG if check_side == 'left' else _RIGHT_LEG
                if not all_visible(landmarks, idx):
                    continue
                hint = self._evaluate_leg_form(landmarks, check_side)
                if hint is not None:
                    return hint
            if not (all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)):
                return HINT_LEG_VISIBLE
            return None
        side = self._select_test_side(landmarks)
        if side is None:
            return HINT_LEG_VISIBLE
        return self._evaluate_leg_form(landmarks, side)

    def _select_test_side(self, landmarks: Sequence[Landmark]) -> str | None:
        """Pick which leg is the measurement leg.

        Chair: the extended test leg (straighter + further forward), not the planted foot.
        Floor: either extended leg; prefer higher visibility.
        """
        scored: list[tuple[float, float, str]] = []
        for side in ('left', 'right'):
            idx_knee = _LEFT_KNEE if side == 'left' else _RIGHT_KNEE
            idx_foot = LANDMARK.LEFT_FOOT_INDEX if side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
            if not all_visible(landmarks, (*idx_knee, idx_foot)):
                continue
            hip, knee, ankle = landmarks[idx_knee[0]], landmarks[idx_knee[1]], landmarks[idx_knee[2]]
            toe = landmarks[idx_foot]
            leg_len = distance(hip, ankle)
            if leg_len <= 0:
                continue
            knee_angle = angle_between(hip, knee, ankle)
            fwd = forward_unit(hip, ankle, toe)
            extension = forward_offset(toe, hip, fwd)
            if self._seating == 'chair':
                scored.append((knee_angle, extension, side))
            else:
                vis = avg_visibility(landmarks, idx_knee)
                scored.append((vis, extension, side))
        if not scored:
            return None
        scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
        return scored[0][2]

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, _LEFT_LEG) or all_visible(landmarks, _RIGHT_LEG)

    def get_calibration_sample_count(self) -> int:
        return len(self._leg_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None = None) -> None:
        _ = hand_landmarks
        side = self._select_test_side(landmarks)
        if side is None:
            return
        self._best_side = side
        if self._form_hint_for_seating(landmarks) is not None:
            return
        idx_leg = _LEFT_LEG if side == 'left' else _RIGHT_LEG
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if side == 'left' else LANDMARK.RIGHT_HIP
        hip, ankle, toe_tip = landmarks[idx_hip], landmarks[idx_leg[1]], landmarks[idx_foot]
        leg_len = distance(hip, ankle)
        if leg_len <= 0:
            return
        self._leg_samples.append(leg_len)
        fwd = forward_unit(hip, ankle, toe_tip)
        toe = toe_line_landmark(ankle, toe_tip)
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
            return TestStateUpdate(
                measurement=None,
                best_measurement=best,
                raw_measurement=self._raw_reach_cm,
            )

        side = self._select_test_side(landmarks) or self._best_side
        if side is not None:
            self._best_side = side
        idx_foot = LANDMARK.LEFT_FOOT_INDEX if self._best_side == 'left' else LANDMARK.RIGHT_FOOT_INDEX
        idx_hip = LANDMARK.LEFT_HIP if self._best_side == 'left' else LANDMARK.RIGHT_HIP
        idx_ankle = LANDMARK.LEFT_ANKLE if self._best_side == 'left' else LANDMARK.RIGHT_ANKLE
        hint = self._form_hint_for_seating(landmarks)
        if hint is not None:
            # No reach tracking while form is invalid (e.g. bent knee while just sitting).
            self._hold_anchor_cm = None
            self._hold_anchor_ms = None
            self._hold_recorded = False
            self._last_hold_progress = 0.0
            return TestStateUpdate(
                measurement=None,
                best_measurement=best,
                raw_measurement=None,
                form_hint=hint,
                form_valid=False,
                hold_progress=0.0,
                recording_status=f'{STATUS_PAUSED_PREFIX} — {hint}',
            )

        hip = landmarks[idx_hip]
        ankle = landmarks[idx_ankle]
        toe_tip = landmarks[idx_foot]
        toe = toe_line_landmark(ankle, toe_tip)
        self._forward = forward_unit(hip, ankle, toe_tip)
        finger = self._finger_landmark(landmarks, hand_landmarks, toe)

        if finger is None:
            return TestStateUpdate(
                measurement=None,
                best_measurement=best,
                raw_measurement=None,
                form_valid=True,
                hold_progress=0.0,
                recording_status=HINT_LEG_VISIBLE,
            )

        # Zero at the live toe each frame (ruler at toe line), not a frozen calib offset.
        reach_norm = forward_reach_norm(finger, toe, self._forward)
        cm = round(reach_norm * self._cm_per_unit, 1)
        self._raw_reach_cm = cm
        self._valid_reach_cm = cm
        if self._raw_best_cm is None or cm > self._raw_best_cm:
            self._raw_best_cm = cm

        idx_knee = LANDMARK.LEFT_KNEE if self._best_side == 'left' else LANDMARK.RIGHT_KNEE
        knee = landmarks[idx_knee]
        past_knee = forward_offset(finger, hip, self._forward) >= forward_offset(knee, hip, self._forward)
        self._had_valid_form = True
        if past_knee:
            self._best_past_knee = True

        recorded_before = len(self._all_reaches)
        self._maybe_record_reach(cm, elapsed_ms)
        hold_progress = self._last_hold_progress

        if len(self._all_reaches) > recorded_before:
            recording_status = STATUS_SCORE_LOCKED
        elif hold_progress > 0.0 and hold_progress < 1.0:
            recording_status = STATUS_HOLD_STEADY
        else:
            recording_status = STATUS_REACH_STAR

        self._last_recording_status = recording_status
        return TestStateUpdate(
            measurement=cm,
            best_measurement=self._robust_best(),
            raw_measurement=cm,
            form_valid=True,
            hold_progress=round(hold_progress, 2),
            recording_status=recording_status,
        )

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        official = self._robust_best()
        practice = self._raw_best_cm
        confidence = self._measurement_confidence(official)

        if official is not None:
            return self._finalize_with_official(official, practice, confidence, ctx)

        # No locked hold — still report traffic-light Position 1 guidance.
        position = classify_chair_sit_reach_position(
            practice,
            form_valid=self._had_valid_form,
            past_knee=self._best_past_knee,
        )
        return TestOutcome(
            measurement=0.0 if practice is None else practice,
            practice_reach_cm=practice,
            measurement_confidence='practice_only',
            classification=position.classification,
            risk_level=position.risk_level,
            terminated_early=ctx.terminated_early,
            calibration_quality=self._calibration_quality,
            interpretation=(
                f'{position.interpretation} Official score needs a straight-leg hold for 3 seconds.'
            ),
        )

    def _finalize_with_official(
        self,
        official: float,
        practice: float | None,
        confidence: MeasurementConfidence,
        ctx: FinalizeContext,
    ) -> TestOutcome:
        low_calib = self._calibration_quality is not None and self._calibration_quality < 0.5
        position = classify_chair_sit_reach_position(
            official,
            form_valid=True,
            past_knee=self._best_past_knee or official >= 0.0,
        )
        interpretation = (
            f'{position.interpretation} '
            f'Score vs toes: {official:+.1f} cm (− short, 0 at toes, + past toes).'
        )
        if self._seating == 'floor':
            interpretation = f'Floor sit-and-reach. {interpretation}'
        else:
            interpretation = f'Chair sit-and-reach. {interpretation}'

        age_band = classify_sit_reach(official, ctx.user_age, ctx.user_sex)
        if age_band is not None:
            interpretation = (
                f'{interpretation} Age-band check: {age_band.classification} '
                f'({age_band.norm_low:+.1f} to {age_band.norm_high:+.1f} cm).'
            )

        if confidence == 'low' or low_calib:
            interpretation = f'{interpretation} Low calibration confidence — clinician review recommended.'

        return TestOutcome(
            measurement=official,
            practice_reach_cm=practice,
            measurement_confidence=confidence,
            terminated_early=ctx.terminated_early,
            classification=position.classification,
            risk_level=position.risk_level,
            interpretation=interpretation,
            norm_low=age_band.norm_low if age_band else position.norm_low,
            norm_high=age_band.norm_high if age_band else position.norm_high,
            calibration_quality=self._calibration_quality,
        )

    def _measurement_confidence(self, official: float | None) -> MeasurementConfidence:
        if official is None:
            return 'practice_only'
        if self._calibration_quality is not None and self._calibration_quality < 0.5:
            return 'low'
        if self._environment == 'home':
            return 'low' if self._calibration_quality is not None and self._calibration_quality < 0.7 else 'high'
        return 'high'

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
        if point_line_distance(knee, hip, ankle) / leg_len > self._thresholds.max_knee_line_dev:
            return HINT_LEG_ALIGN

        if knee_angle < self._thresholds.min_knee_angle:
            return HINT_KNEE_BENT

        # Chair sit-and-reach often uses a flexed foot (toes pointing up). Allow that;
        # only reject when the toes droop well below the ankle (heel / contact unreliable).
        if (toe.y - ankle.y) / leg_len > self._thresholds.max_foot_lift:
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
        tip_ids = (
            HAND_LANDMARK.INDEX_FINGER_TIP,
            HAND_LANDMARK.MIDDLE_FINGER_TIP,
            HAND_LANDMARK.RING_FINGER_TIP,
            HAND_LANDMARK.PINKY_TIP,
        )
        if hand_landmarks and self._forward is not None:
            best: Landmark | None = None
            best_reach: float | None = None
            for hand in hand_landmarks:
                for tip_id in tip_ids:
                    tip = hand[tip_id]
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
        if self._hold_anchor_ms is None:
            self._last_hold_progress = 0.0
            return
        progress = min(1.0, max(0.0, (elapsed_ms - self._hold_anchor_ms) / _HOLD_MS))
        self._last_hold_progress = progress
        if self._hold_recorded:
            return
        if progress < 1.0:
            return
        if self._is_outlier(cm):
            self._hold_recorded = True
            self._last_hold_progress = 1.0
            return
        self._all_reaches.append(cm)
        self._hold_recorded = True
        self._last_hold_progress = 1.0

    def _start_hold(self, cm: float, elapsed_ms: float) -> None:
        self._hold_anchor_cm = cm
        self._hold_anchor_ms = elapsed_ms
        self._hold_recorded = False
        self._last_hold_progress = 0.0

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

    @staticmethod
    def gamification_target_cm() -> float:
        return _GAMIFICATION_TARGET_CM
