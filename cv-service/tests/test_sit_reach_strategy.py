"""Unit tests for sit-and-reach CV strategy (calibration, scoring, finalize)."""

from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import (
    ASSUMED_HEIGHT_CM,
    HINT_FOOT_FLAT,
    HINT_KNEE_BENT,
    HINT_LEG_ALIGN,
    LEG_LENGTH_FRACTION_OF_HEIGHT,
    SitReachStrategy,
    forward_offset,
    forward_unit,
    reach_from_baseline,
    toe_line_landmark,
)
from tests.helpers import hand_middle_finger_at, sit_reach_side_pose, visible


def _calibrate(strategy: SitReachStrategy, *, samples: int = 3) -> None:
    pose = sit_reach_side_pose(side="right")
    for _ in range(samples):
        strategy.on_calibration_frame(pose)
    ok, err = strategy.finish_calibration()
    assert ok, err


def _leg_scale_cm() -> float:
    return ASSUMED_HEIGHT_CM * LEG_LENGTH_FRACTION_OF_HEIGHT


def _reach_cm(finger_x: float, toe_x: float = 0.78) -> float:
    hip = visible(0.30, 0.55)
    ankle = visible(0.70, 0.55)
    toe_tip = visible(toe_x, 0.55)
    toe = toe_line_landmark(ankle, toe_tip)
    finger = visible(finger_x, 0.50)
    fwd = forward_unit(hip, ankle, toe_tip)
    baseline = forward_offset(toe, hip, fwd)
    scale = _leg_scale_cm() / 0.4
    return round(reach_from_baseline(finger, hip, fwd, baseline) * scale, 1)


def _hold_reach(
    strategy: SitReachStrategy,
    *,
    finger_x: float = 0.88,
    start_ms: float = 0.0,
    frames: int = 14,
    step_ms: float = 250.0,
) -> None:
    """Simulate a stable reach held long enough to record one sample (3 s hold)."""
    pose = sit_reach_side_pose(side="right", finger=(finger_x, 0.50))
    hands = hand_middle_finger_at(finger_x, 0.50)
    for i in range(frames):
        strategy.update(pose, elapsed_ms=start_ms + (i + 1) * step_ms, hand_landmarks=hands)


def _record_holds(strategy: SitReachStrategy, count: int, finger_x: float = 0.88) -> None:
    for i in range(count):
        _hold_reach(strategy, finger_x=finger_x, start_ms=i * 4500.0)
        if i + 1 < count:
            retract_x = finger_x - 0.08
            pose = sit_reach_side_pose(side="right", finger=(retract_x, 0.50))
            hands = hand_middle_finger_at(retract_x, 0.50)
            strategy.update(pose, elapsed_ms=(i + 1) * 4500.0 - 200.0, hand_landmarks=hands)


class TestSitReachStrategy:
    def test_metadata(self) -> None:
        s = SitReachStrategy()
        assert s.test_id == "sit_reach"
        assert s.requires_hands is True
        assert s.calibration_s == 3
        assert s.active_duration_s == 30
        assert "sideways" in s.calibration_prompt.lower() or "chair" in s.calibration_prompt.lower()

    def test_reset_clears_state(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _record_holds(s, 1)
        s.reset()
        assert s.get_calibration_sample_count() == 0
        ok, msg = s.finish_calibration()
        assert ok is False
        assert msg is not None

    def test_calibration_fails_with_too_few_samples(self) -> None:
        s = SitReachStrategy()
        s.on_calibration_frame(sit_reach_side_pose())
        s.on_calibration_frame(sit_reach_side_pose())
        ok, msg = s.finish_calibration()
        assert ok is False
        assert msg is not None
        assert "leg" in msg.lower()

    def test_calibration_uses_height_for_leg_length(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 180.0)
        _calibrate(s)
        expected = round(
            (0.88 - toe_line_landmark(visible(0.70, 0.55), visible(0.78, 0.55)).x)
            * (180 * LEG_LENGTH_FRACTION_OF_HEIGHT / 0.4),
            1,
        )
        _hold_reach(s)
        assert s._all_reaches == [expected]

    def test_calibration_succeeds_and_scales_reach_cm(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _hold_reach(s)
        assert s._all_reaches == [_reach_cm(0.88)]

    def test_prefers_hand_middle_finger_over_pose_index(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        pose = sit_reach_side_pose(side="right", finger=(0.82, 0.50))
        hands = hand_middle_finger_at(0.90, 0.50)
        for i in range(14):
            s.update(pose, elapsed_ms=(i + 1) * 250.0, hand_landmarks=hands)
        assert s._all_reaches == [_reach_cm(0.90)]

    def test_tracks_robust_best_across_holds(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _hold_reach(s, finger_x=0.82, start_ms=0.0)
        _hold_reach(s, finger_x=0.92, start_ms=4500.0)
        _hold_reach(s, finger_x=0.88, start_ms=9000.0)
        update = s.update(
            sit_reach_side_pose(finger=(0.84, 0.50)),
            elapsed_ms=13500.0,
            hand_landmarks=hand_middle_finger_at(0.84, 0.50),
        )
        assert update.best_measurement == _reach_cm(0.88)

    def test_finalize_classifies_when_enough_holds(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _record_holds(s, 3, finger_x=0.88)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=False))
        assert outcome.measurement == _reach_cm(0.88)
        assert outcome.classification == "Position 3"
        assert outcome.risk_level == "low"
        assert outcome.interpretation is not None
        assert "Age-band check" in outcome.interpretation

    def test_finalize_early_stop_returns_best_partial_not_zero(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _record_holds(s, 1, finger_x=0.88)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == _reach_cm(0.88)
        assert outcome.classification == "Position 3"
        assert outcome.terminated_early is True

    def test_finalize_without_samples_returns_zero(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == 0.0

    def test_rejects_bent_knee(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        _calibrate(s)
        bent = sit_reach_side_pose(side="right", knee=(0.50, 0.59))
        _hold_reach(s, finger_x=0.88, start_ms=0.0, frames=1)
        before = len(s._all_reaches)
        for i in range(9):
            update = s.update(bent, elapsed_ms=5000.0 + (i + 1) * 250.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
            assert update.form_hint == HINT_KNEE_BENT
            assert update.measurement is None
            assert update.raw_measurement is None
            assert update.recording_status is not None
            assert 'Recording paused' in update.recording_status
        assert len(s._all_reaches) == before

    def test_no_reach_tracked_when_form_invalid(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        _calibrate(s)
        bent = sit_reach_side_pose(side="right", knee=(0.50, 0.59))
        update = s.update(bent, elapsed_ms=2500.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
        assert update.raw_measurement is None
        assert update.measurement is None
        assert update.form_valid is False
        assert s._raw_best_cm is None

    def test_home_threshold_allows_slightly_bent_knee(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "home")
        clinic = SitReachStrategy()
        clinic.on_init(None, "male", 170.0, "clinic")
        pose = sit_reach_side_pose(side="right", knee=(0.50, 0.59))
        assert s._evaluate_leg_form(pose, "right") is None
        assert clinic._evaluate_leg_form(pose, "right") == HINT_KNEE_BENT

    def test_home_threshold_allows_misaligned_leg(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "home")
        clinic = SitReachStrategy()
        clinic.on_init(None, "male", 170.0, "clinic")
        pose = sit_reach_side_pose(side="right", knee=(0.50, 0.60))
        assert s._evaluate_leg_form(pose, "right") is None
        assert clinic._evaluate_leg_form(pose, "right") == HINT_LEG_ALIGN

    def test_hold_progress_increases_during_stable_reach(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        pose = sit_reach_side_pose(side="right", finger=(0.88, 0.50))
        hands = hand_middle_finger_at(0.88, 0.50)
        update = s.update(pose, elapsed_ms=1000.0, hand_landmarks=hands)
        assert update.form_valid is True
        assert update.hold_progress == 0.0
        update = s.update(pose, elapsed_ms=2000.0, hand_landmarks=hands)
        assert update.hold_progress is not None
        assert 0.0 < update.hold_progress < 1.0

    def test_finalize_zero_when_only_invalid_form(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        _calibrate(s)
        hands = hand_middle_finger_at(0.88, 0.50)
        bent = sit_reach_side_pose(side="right", knee=(0.50, 0.59))
        for i in range(5):
            s.update(bent, elapsed_ms=(i + 1) * 400.0, hand_landmarks=hands)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == 0.0
        assert outcome.practice_reach_cm is None
        assert outcome.measurement_confidence == "practice_only"
        assert outcome.classification == "Position 1"

    def test_rejects_misaligned_leg(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        _calibrate(s)
        misaligned = sit_reach_side_pose(side="right", knee=(0.50, 0.60))
        update = s.update(misaligned, elapsed_ms=2500.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
        assert update.form_hint == HINT_LEG_ALIGN
        assert update.measurement is None

    def test_rejects_lifted_foot(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        _calibrate(s)
        # Toes drooping well below the ankle (not flexed-up chair sit-reach posture).
        lifted = sit_reach_side_pose(side="right", ankle=(0.70, 0.50), toe=(0.78, 0.62))
        update = s.update(lifted, elapsed_ms=2500.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
        assert update.form_hint == HINT_FOOT_FLAT

    def test_allows_flexed_toes_up(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        _calibrate(s)
        flexed = sit_reach_side_pose(side="right", ankle=(0.70, 0.55), toe=(0.78, 0.42))
        update = s.update(flexed, elapsed_ms=2500.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
        assert update.form_hint is None
        assert update.form_valid is True

    def test_calibration_skips_bent_knee_frames(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic")
        good = sit_reach_side_pose(side="right")
        bent = sit_reach_side_pose(side="right", knee=(0.50, 0.59))
        s.on_calibration_frame(good)
        s.on_calibration_frame(bent)
        s.on_calibration_frame(good)
        assert s.get_calibration_sample_count() == 2
        assert s.form_hint_for(bent, "calibrating") == HINT_KNEE_BENT

    def test_calibration_sets_quality_score(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        assert s.get_calibration_quality() is not None
        assert 0.0 <= s.get_calibration_quality() <= 1.0

    def test_finalize_flags_low_calibration_in_interpretation(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        s._calibration_quality = 0.3
        _record_holds(s, 3, finger_x=0.88)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=False))
        assert outcome.calibration_quality == 0.3
        assert outcome.interpretation is not None
        assert "Low calibration confidence" in outcome.interpretation

    def test_smoother_config_is_slower_than_default(self) -> None:
        s = SitReachStrategy()
        mc, beta = s.smoother_config()
        assert mc < 1.5
        assert beta < 0.05

    def test_is_frame_usable_when_either_leg_visible(self) -> None:
        s = SitReachStrategy()
        assert s.is_frame_usable(sit_reach_side_pose(side="right")) is True
        assert s.is_frame_usable(sit_reach_side_pose(side="left")) is True

    def test_floor_seating_updates_prompt(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "female", 165.0, "home", "floor")
        assert "floor" in s.calibration_prompt.lower()
        assert s._seating == "floor"

    def test_floor_requires_both_visible_legs_straight(self) -> None:
        from app.cv.landmarks import LANDMARK
        from tests.helpers import make_pose, visible

        s = SitReachStrategy()
        s.on_init(None, "male", 170.0, "clinic", "floor")
        _calibrate(s)
        pose = sit_reach_side_pose(side="right", finger=(0.88, 0.50))
        bent_left = make_pose({
            LANDMARK.LEFT_HIP: visible(0.30, 0.55),
            LANDMARK.LEFT_KNEE: visible(0.50, 0.62),
            LANDMARK.LEFT_ANKLE: visible(0.70, 0.55),
            LANDMARK.LEFT_FOOT_INDEX: visible(0.78, 0.55),
            LANDMARK.RIGHT_HIP: pose[LANDMARK.RIGHT_HIP],
            LANDMARK.RIGHT_KNEE: pose[LANDMARK.RIGHT_KNEE],
            LANDMARK.RIGHT_ANKLE: pose[LANDMARK.RIGHT_ANKLE],
            LANDMARK.RIGHT_FOOT_INDEX: pose[LANDMARK.RIGHT_FOOT_INDEX],
            LANDMARK.RIGHT_INDEX: pose[LANDMARK.RIGHT_INDEX],
        })
        update = s.update(bent_left, elapsed_ms=2500.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
        assert update.form_valid is False
        assert update.measurement is None

    def test_short_of_toes_scores_negative(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home")
        _calibrate(s)
        _hold_reach(s, finger_x=0.70)
        assert s._all_reaches[0] < 0
        assert abs(s._all_reaches[0] - _reach_cm(0.70)) <= 0.2

    def test_chair_picks_extended_leg_not_planted(self) -> None:
        """Planted foot can be more visible; chair must still zero on the extended test leg."""
        from app.cv.landmarks import LANDMARK
        from app.cv.types import Landmark
        from tests.helpers import make_pose

        def bright(x: float, y: float) -> Landmark:
            return Landmark(x, y, visibility=0.99)

        def dim(x: float, y: float) -> Landmark:
            return Landmark(x, y, visibility=0.70)

        # Left = planted (bent, higher visibility). Right = extended test leg.
        pose = make_pose({
            LANDMARK.LEFT_HIP: bright(0.32, 0.55),
            LANDMARK.LEFT_KNEE: bright(0.40, 0.68),
            LANDMARK.LEFT_ANKLE: bright(0.38, 0.82),
            LANDMARK.LEFT_FOOT_INDEX: bright(0.40, 0.84),
            LANDMARK.RIGHT_HIP: dim(0.30, 0.55),
            LANDMARK.RIGHT_KNEE: dim(0.50, 0.55),
            LANDMARK.RIGHT_ANKLE: dim(0.70, 0.55),
            LANDMARK.RIGHT_FOOT_INDEX: dim(0.78, 0.55),
            LANDMARK.RIGHT_INDEX: dim(0.70, 0.50),
        })
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        assert s._select_test_side(pose) == "right"
        for _ in range(3):
            s.on_calibration_frame(pose)
        ok, _ = s.finish_calibration()
        assert ok
        hands = hand_middle_finger_at(0.70, 0.50)
        for i in range(14):
            s.update(pose, elapsed_ms=(i + 1) * 250.0, hand_landmarks=hands)
        assert s._all_reaches
        assert s._all_reaches[0] < 0

