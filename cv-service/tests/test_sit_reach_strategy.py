"""Unit tests for sit-and-reach CV strategy (calibration, scoring, finalize)."""

from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import ASSUMED_HEIGHT_CM, LEG_LENGTH_FRACTION_OF_HEIGHT, SitReachStrategy
from tests.helpers import hand_middle_finger_at, sit_reach_side_pose


def _calibrate(strategy: SitReachStrategy, *, samples: int = 3) -> None:
    pose = sit_reach_side_pose(side="right")
    for _ in range(samples):
        strategy.on_calibration_frame(pose)
    ok, err = strategy.finish_calibration()
    assert ok, err


def _leg_scale_cm() -> float:
    return ASSUMED_HEIGHT_CM * LEG_LENGTH_FRACTION_OF_HEIGHT


def _reach_cm(finger_x: float, toe_x: float = 0.55) -> float:
    scale = _leg_scale_cm() / 0.4
    return round((finger_x - toe_x) * scale, 1)


def _hold_reach(
    strategy: SitReachStrategy,
    *,
    finger_x: float = 0.65,
    start_ms: float = 0.0,
    frames: int = 9,
    step_ms: float = 250.0,
) -> None:
    """Simulate a stable reach held long enough to record one sample."""
    pose = sit_reach_side_pose(side="right", finger=(finger_x, 0.70))
    hands = hand_middle_finger_at(finger_x, 0.70)
    for i in range(frames):
        strategy.update(pose, elapsed_ms=start_ms + (i + 1) * step_ms, hand_landmarks=hands)


def _record_holds(strategy: SitReachStrategy, count: int, finger_x: float = 0.65) -> None:
    for i in range(count):
        _hold_reach(strategy, finger_x=finger_x, start_ms=i * 3500.0)
        if i + 1 < count:
            retract_x = finger_x - 0.08
            pose = sit_reach_side_pose(side="right", finger=(retract_x, 0.70))
            hands = hand_middle_finger_at(retract_x, 0.70)
            strategy.update(pose, elapsed_ms=(i + 1) * 3500.0 - 200.0, hand_landmarks=hands)


class TestSitReachStrategy:
    def test_metadata(self) -> None:
        s = SitReachStrategy()
        assert s.test_id == "sit_reach"
        assert s.requires_hands is True
        assert s.calibration_s == 3
        assert s.active_duration_s == 30
        assert "sideways" in s.calibration_prompt.lower()

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
        expected = round((0.65 - 0.55) * (180 * LEG_LENGTH_FRACTION_OF_HEIGHT / 0.4), 1)
        _hold_reach(s)
        assert s._all_reaches == [expected]

    def test_calibration_succeeds_and_scales_reach_cm(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _hold_reach(s)
        assert s._all_reaches == [_reach_cm(0.65)]

    def test_prefers_hand_middle_finger_over_pose_index(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        pose = sit_reach_side_pose(side="right", finger=(0.60, 0.70))
        hands = hand_middle_finger_at(0.68, 0.70)
        for i in range(9):
            s.update(pose, elapsed_ms=(i + 1) * 250.0, hand_landmarks=hands)
        assert s._all_reaches == [_reach_cm(0.68)]

    def test_tracks_robust_best_across_holds(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _hold_reach(s, finger_x=0.60, start_ms=0.0)
        _hold_reach(s, finger_x=0.70, start_ms=3500.0)
        _hold_reach(s, finger_x=0.65, start_ms=7000.0)
        update = s.update(
            sit_reach_side_pose(finger=(0.62, 0.70)),
            elapsed_ms=10500.0,
            hand_landmarks=hand_middle_finger_at(0.62, 0.70),
        )
        assert update.best_measurement == _reach_cm(0.65)

    def test_finalize_classifies_when_enough_holds(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _record_holds(s, 3, finger_x=0.65)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=False))
        assert outcome.measurement == _reach_cm(0.65)
        assert outcome.classification == "Above Average"
        assert outcome.risk_level == "low"

    def test_finalize_early_stop_returns_best_partial_not_zero(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _record_holds(s, 1, finger_x=0.65)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == _reach_cm(0.65)
        assert outcome.classification is None
        assert outcome.terminated_early is True

    def test_finalize_without_samples_returns_zero(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == 0.0

    def test_rejects_bent_knee(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        bent = sit_reach_side_pose(side="right", knee=(0.45, 0.65))
        _hold_reach(s, finger_x=0.65, start_ms=0.0, frames=1)
        before = len(s._all_reaches)
        for i in range(9):
            s.update(bent, elapsed_ms=5000.0 + (i + 1) * 250.0, hand_landmarks=hand_middle_finger_at(0.65, 0.70))
        assert len(s._all_reaches) == before

    def test_is_frame_usable_when_either_leg_visible(self) -> None:
        s = SitReachStrategy()
        assert s.is_frame_usable(sit_reach_side_pose(side="right")) is True
        assert s.is_frame_usable(sit_reach_side_pose(side="left")) is True
