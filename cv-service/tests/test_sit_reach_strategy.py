"""Unit tests for sit-and-reach CV strategy (calibration, scoring, finalize)."""

from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import SitReachStrategy
from tests.helpers import sit_reach_side_pose


def _calibrate(strategy: SitReachStrategy, *, samples: int = 3) -> None:
    pose = sit_reach_side_pose(side="right")
    for _ in range(samples):
        strategy.on_calibration_frame(pose)
    ok, err = strategy.finish_calibration()
    assert ok, err


def _run_reaches(strategy: SitReachStrategy, count: int, finger_x: float = 0.65) -> None:
    for _ in range(count):
        pose = sit_reach_side_pose(side="right", finger=(finger_x, 0.70))
        strategy.update(pose, elapsed_ms=0.0)


class TestSitReachStrategy:
    def test_metadata(self) -> None:
        s = SitReachStrategy()
        assert s.test_id == "sit_reach"
        assert s.calibration_s == 3
        assert s.active_duration_s == 30
        assert "sideways" in s.calibration_prompt.lower()

    def test_reset_clears_state(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _run_reaches(s, 5)
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

    def test_calibration_succeeds_and_scales_reach_cm(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        # Leg length 0.4 norm units → 90 cm / 0.4 = 225 cm/unit; finger 0.10 past toe → 22.5 cm
        update = s.update(sit_reach_side_pose(side="right", finger=(0.65, 0.70)), 0.0)
        assert update.measurement == 22.5
        assert update.best_measurement == 22.5

    def test_tracks_best_reach_across_frames(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        s.update(sit_reach_side_pose(finger=(0.60, 0.70)), 0.0)  # 11.2 cm
        s.update(sit_reach_side_pose(finger=(0.70, 0.70)), 0.0)  # 33.8 cm — best
        s.update(sit_reach_side_pose(finger=(0.65, 0.70)), 0.0)  # 22.5 cm
        update = s.update(sit_reach_side_pose(finger=(0.62, 0.70)), 0.0)
        assert update.best_measurement == 33.7
        assert update.measurement == 15.7

    def test_finalize_classifies_when_enough_samples(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _run_reaches(s, 10, finger_x=0.65)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=False))
        assert outcome.measurement == 22.5
        assert outcome.classification == "Above Average"
        assert outcome.risk_level == "low"
        assert outcome.norm_low == -8.9
        assert outcome.norm_high == 6.4

    def test_finalize_early_stop_returns_best_partial_not_zero(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        _run_reaches(s, 5, finger_x=0.65)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == 22.5
        assert outcome.classification is None
        assert outcome.terminated_early is True

    def test_finalize_without_samples_returns_zero(self) -> None:
        s = SitReachStrategy()
        _calibrate(s)
        outcome = s.finalize(FinalizeContext(user_age=72, user_sex="male", terminated_early=True))
        assert outcome.measurement == 0.0

    def test_is_frame_usable_when_either_leg_visible(self) -> None:
        s = SitReachStrategy()
        assert s.is_frame_usable(sit_reach_side_pose(side="right")) is True
        assert s.is_frame_usable(sit_reach_side_pose(side="left")) is True
