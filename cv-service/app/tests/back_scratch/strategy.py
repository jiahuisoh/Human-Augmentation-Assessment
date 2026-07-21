import math
import statistics
from collections import deque
from typing import Sequence
from app.cv.hand_detector import HAND_LANDMARK
from app.cv.landmarks import LANDMARK, all_visible, pick_better_side
from app.cv.types import Landmark, Sex, TestOutcome
from app.tests.base import FinalizeContext, TestStateUpdate, TestStrategy, calibration_quality_from_samples
from app.tests.back_scratch.norms import classify_back_scratch


SHOULDER_TO_HIP_FRACTION_OF_HEIGHT = 0.288
_MIN_CALIB_SAMPLES = 3
_MIN_TEST_SAMPLES = 10
HOLD_SECONDS = 2.5
_HOLD_MS = HOLD_SECONDS * 1000.0
_MIN_HOLD_FRAMES = 8
_HOLD_MAX_STDEV_CM = 4.0
_LIVE_SMOOTH_FRAMES = 5
_MAX_JUMP_CM = 12.0
_LEFT_TORSO = (LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP)
_RIGHT_TORSO = (LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP)


def _dist2d(a: Landmark, b: Landmark) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


class BackScratchStrategy(TestStrategy):
    test_id = 'back_scratch'
    calibration_s = 3
    countdown_s = 3
    active_duration_s = 30
    min_calibration_samples = _MIN_CALIB_SAMPLES
    requires_hands = True
    calibration_prompt = 'Stand side-on to the camera, standing tall with your whole upper body in frame. Hold still.'

    def __init__(self) -> None:
        self._user_height_cm: float | None = None
        self._torso_samples: list[float] = []
        self._cm_per_unit: float | None = None
        self._samples: deque[tuple[float, float]] = deque()
        self._frames_scored: int = 0
        self._best_held_cm: float | None = None
        self._best_seen_cm: float | None = None
        self._last_score_cm: float | None = None
        self._pending_jump: bool = False

    def reset(self) -> None:
        self._torso_samples.clear()
        self._cm_per_unit = None
        self._samples.clear()
        self._frames_scored = 0
        self._best_held_cm = None
        self._best_seen_cm = None
        self._last_score_cm = None
        self._pending_jump = False

    def on_init(self, user_age: int | None, user_sex: Sex, user_height: float | None) -> None:
        _ = (user_age, user_sex)
        self._user_height_cm = user_height

    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        return all_visible(landmarks, (LANDMARK.LEFT_SHOULDER,)) or all_visible(landmarks, (LANDMARK.RIGHT_SHOULDER,))

    def is_tracking(self, landmarks: Sequence[Landmark] | None, hand_landmarks: Sequence[Sequence[Landmark]] | None) -> bool:
        _ = landmarks
        return self._fingertips(hand_landmarks) is not None

    def get_calibration_sample_count(self) -> int:
        return len(self._torso_samples)

    def get_calibration_quality(self) -> float | None:
        return calibration_quality_from_samples(self._torso_samples)

    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> None:
        _ = hand_landmarks
        side, _score = pick_better_side(landmarks, _LEFT_TORSO, _RIGHT_TORSO)
        idx = _LEFT_TORSO if side == 'left' else _RIGHT_TORSO
        if not all_visible(landmarks, idx):
            return
        torso = _dist2d(landmarks[idx[0]], landmarks[idx[1]])
        if torso > 0:
            self._torso_samples.append(torso)

    def finish_calibration(self) -> tuple[bool, str | None]:
        if len(self._torso_samples) < _MIN_CALIB_SAMPLES:
            return (False, 'Could not see your upper body clearly. Stand side-on so your shoulder and hip are both visible.')
        if self._user_height_cm is None or self._user_height_cm <= 0:
            return (False, 'No height on file for this client. Add their height to their profile, then retry.')
        median_torso = statistics.median(self._torso_samples)
        torso_cm = self._user_height_cm * SHOULDER_TO_HIP_FRACTION_OF_HEIGHT
        self._cm_per_unit = torso_cm / median_torso
        return (True, None)

    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[Sequence[Landmark]] | None=None) -> TestStateUpdate:
        if self._cm_per_unit is None:
            return TestStateUpdate(measurement=self._last_score_cm, best_measurement=self._best_held_cm)
        points = self._fingertips(hand_landmarks)
        if points is None:
            return TestStateUpdate(measurement=self._last_score_cm, best_measurement=self._best_held_cm)
        (tip_a, wrist_a), (tip_b, wrist_b) = points
        raw_cm = self._signed_score_cm(tip_a, wrist_a, tip_b, wrist_b)

        # Outlier rejection with one-frame tolerance: a lone glitch spike is
        # dropped, but if the next frame confirms the new position it is treated
        # as real movement, so a genuine reach is never permanently rejected.
        if self._last_score_cm is not None and abs(raw_cm - self._last_score_cm) > _MAX_JUMP_CM and not self._pending_jump:
            self._pending_jump = True
            return TestStateUpdate(measurement=self._last_score_cm, best_measurement=self._best_held_cm)
        self._pending_jump = False
        self._frames_scored += 1

        self._samples.append((elapsed_ms, raw_cm))
        cutoff = elapsed_ms - _HOLD_MS
        while len(self._samples) >= 2 and self._samples[1][0] < cutoff:
            self._samples.popleft()
        scores = [s for _, s in self._samples]

        live = round(statistics.median(scores[-_LIVE_SMOOTH_FRAMES:]), 1)
        self._last_score_cm = live
        self._best_seen_cm = live if self._best_seen_cm is None else max(self._best_seen_cm, live)

        span_ms = self._samples[-1][0] - self._samples[0][0]
        if span_ms >= _HOLD_MS and len(scores) >= _MIN_HOLD_FRAMES and statistics.pstdev(scores) <= _HOLD_MAX_STDEV_CM:
            held = round(statistics.median(scores), 1)
            self._best_held_cm = held if self._best_held_cm is None else max(self._best_held_cm, held)

        return TestStateUpdate(measurement=live, best_measurement=self._best_held_cm)

    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        # measurement stays None when nothing was scored: 0.0 cm is a real
        # result (fingertips exactly touching), not a "no data" sentinel.
        if self._frames_scored < _MIN_TEST_SAMPLES:
            return TestOutcome(terminated_early=ctx.terminated_early)
        best = self._best_held_cm if self._best_held_cm is not None else self._best_seen_cm
        if best is None:
            return TestOutcome(terminated_early=ctx.terminated_early)
        classification = classify_back_scratch(best, ctx.user_age, ctx.user_sex)
        if classification is None:
            return TestOutcome(measurement=best, terminated_early=ctx.terminated_early)
        return TestOutcome(measurement=best, terminated_early=ctx.terminated_early, classification=classification.classification, risk_level=classification.risk_level, interpretation=classification.interpretation, norm_low=classification.norm_low, norm_high=classification.norm_high, norm_applicability=classification.norm_applicability)

    def _signed_score_cm(self, tip_a: Landmark, wrist_a: Landmark, tip_b: Landmark, wrist_b: Landmark) -> float:
        # Clinical convention (Rikli & Jones): fingers overlapping is positive,
        # a gap between the fingertips is negative. Order-independent and driven
        # by finger orientation, so a left/right hand swap does not change it.
        dist_cm = _dist2d(tip_a, tip_b) * self._cm_per_unit
        a_points_down = tip_a.y > wrist_a.y
        b_points_down = tip_b.y > wrist_b.y
        if a_points_down and not b_points_down:
            down_tip, up_tip = tip_a, tip_b
        elif b_points_down and not a_points_down:
            down_tip, up_tip = tip_b, tip_a
        else:
            return round(-dist_cm, 1)
        overlapped = down_tip.y > up_tip.y
        return round(dist_cm if overlapped else -dist_cm, 1)

    def _fingertips(self, hand_landmarks: Sequence[Sequence[Landmark]] | None) -> tuple[tuple[Landmark, Landmark], tuple[Landmark, Landmark]] | None:
        if hand_landmarks and len(hand_landmarks) >= 2:
            h0, h1 = hand_landmarks[0], hand_landmarks[1]
            if min(len(h0), len(h1)) > HAND_LANDMARK.MIDDLE_FINGER_TIP:
                return (
                    (h0[HAND_LANDMARK.MIDDLE_FINGER_TIP], h0[HAND_LANDMARK.WRIST]),
                    (h1[HAND_LANDMARK.MIDDLE_FINGER_TIP], h1[HAND_LANDMARK.WRIST]),
                )
        return None
