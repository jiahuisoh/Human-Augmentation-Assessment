import statistics
from typing import Sequence
from app.cv.landmarks import LANDMARK, all_visible, angle_between, pick_better_side
from app.cv.types import Landmark, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy, calibration_quality_from_samples
from app.tests.chair_stand.norms import classify_chair_stand
from app.tests.chair_stand.sppb import meets_awgs19_slow_sts, sppb_sts_points
_STAND_GAP_DOWN = 35
_STAND_GAP_UP = 10
_MIN_CALIB_SAMPLES = 3
# SPPB times five stands from a seated start. The person begins this test
# standing, so we start the clock at the first sit instead: first-down to
# fifth-stand is 5 stand-ups and 4 sit-downs, matching the SPPB sequence.
_SPPB_STANDS = 5
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
        self._first_down_ms: float | None = None
        self._fifth_stand_ms: float | None = None
        self._side_votes: dict[str, int] = {'left': 0, 'right': 0}
        self._locked_side: str | None = None

    def reset(self) -> None:
        self._samples.clear()
        self._standing_baseline = None
        self._posture = 'unknown'
        self._reps = 0
        self._first_down_ms = None
        self._fifth_stand_ms = None
        self._side_votes = {'left': 0, 'right': 0}
        self._locked_side = None

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return self._knee_angle(landmarks) is not None

    def get_calibration_sample_count(self) -> int:
        return len(self._samples)

    def get_calibration_quality(self) -> float | None:
        return calibration_quality_from_samples(self._samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        side, _score = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
        self._side_votes[side] += 1
        angle = self._angle_for(landmarks, _LEFT_LEG if side == 'left' else _RIGHT_LEG)
        if angle is not None:
            self._samples.append(angle)

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not detect your full body. Step back so your hip, knee, and ankle are all visible from the side.')
        self._locked_side = 'left' if self._side_votes['left'] > self._side_votes['right'] else 'right'
        self._standing_baseline = statistics.median(self._samples)
        self._posture = 'up'
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        _ = hand_landmarks
        angle = self._knee_angle(landmarks)
        if angle is None or self._standing_baseline is None:
            return TestStateUpdate(reps=self._reps, posture=self._posture, angle=None)
        down_at = self._standing_baseline - _STAND_GAP_DOWN
        up_at = self._standing_baseline - _STAND_GAP_UP
        if self._posture != 'down' and angle < down_at:
            self._posture = 'down'
            if self._first_down_ms is None:
                self._first_down_ms = elapsed_ms
        elif self._posture == 'down' and angle > up_at:
            self._posture = 'up'
            self._reps += 1
            if self._reps == _SPPB_STANDS and self._fifth_stand_ms is None:
                self._fifth_stand_ms = elapsed_ms
        return TestStateUpdate(reps=self._reps, posture=self._posture, angle=angle)

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        seconds, points, awgs_slow = self._sppb_fields(ctx.terminated_early)
        outcome = TestOutcome(reps=self._reps, terminated_early=ctx.terminated_early, time_to_5_stands_s=seconds, sppb_sts_points=points, awgs19_slow_sts=awgs_slow)
        classification = classify_chair_stand(self._reps, ctx.user_age, ctx.user_sex)
        if classification is not None:
            outcome.classification = classification.classification
            outcome.risk_level = classification.risk_level
            outcome.interpretation = classification.interpretation
            outcome.norm_low = classification.norm_low
            outcome.norm_high = classification.norm_high
            outcome.norm_applicability = classification.norm_applicability
        # The age/sex band only says where someone sits among healthy peers, so
        # it never yields `high`. A validated cut-off does: escalate only here.
        if awgs_slow:
            outcome.risk_level = 'high'
            outcome.interpretation = self._append(outcome.interpretation, f'Five stands took {seconds}s, which meets a screening threshold (AWGS19, 12s or more) for reduced physical performance. This is a screening indicator, not a diagnosis - a clinician should review.' if seconds is not None else 'Fewer than five stands were completed in 30 seconds, which the SPPB scores as 0. This is a screening indicator, not a diagnosis - a clinician should review.')
        return outcome

    def _sppb_fields(self, terminated_early: bool) -> tuple[float | None, int | None, bool | None]:
        if self._first_down_ms is not None and self._fifth_stand_ms is not None:
            seconds = round((self._fifth_stand_ms - self._first_down_ms) / 1000.0, 1)
            return (seconds, sppb_sts_points(seconds), meets_awgs19_slow_sts(seconds))
        if terminated_early:
            # Stopping early is not evidence they could not do five stands.
            return (None, None, None)
        # A full 30 s elapsed without five stands, so five would have taken
        # longer than 30 s: the SPPB scores that 0 and it clears the AWGS19 cut-off.
        return (None, 0, True)

    @staticmethod
    def _append(base: str | None, extra: str) -> str:
        return f'{base} {extra}' if base else extra

    def _knee_angle(self, landmarks: Sequence[Landmark]) -> float | None:
        if self._locked_side is None:
            side, _score = pick_better_side(landmarks, _LEFT_LEG, _RIGHT_LEG)
            return self._angle_for(landmarks, _LEFT_LEG if side == 'left' else _RIGHT_LEG)
        primary = _LEFT_LEG if self._locked_side == 'left' else _RIGHT_LEG
        angle = self._angle_for(landmarks, primary)
        if angle is not None:
            return angle
        # Locked leg went out of view: measure the other rather than stop
        # counting outright. Rarer than the per-frame flip it replaces.
        fallback = _RIGHT_LEG if self._locked_side == 'left' else _LEFT_LEG
        return self._angle_for(landmarks, fallback)

    @staticmethod
    def _angle_for(landmarks: Sequence[Landmark], idx: tuple[int, int, int]) -> float | None:
        if not all_visible(landmarks, idx):
            return None
        return angle_between(landmarks[idx[0]], landmarks[idx[1]], landmarks[idx[2]])
