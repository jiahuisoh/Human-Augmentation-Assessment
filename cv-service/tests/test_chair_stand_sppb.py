"""Tests for the exploratory SPPB sit-to-stand derivation."""

from app.tests.base import FinalizeContext
from app.tests.chair_stand.sppb import meets_awgs19_slow_sts, sppb_sts_points
from app.tests.chair_stand.strategy import ChairStandStrategy
from tests.helpers import make_pose, visible
from app.cv.landmarks import LANDMARK


class TestSppbPoints:
    def test_boundaries_match_guralnik_1994(self) -> None:
        assert sppb_sts_points(11.1) == 4
        assert sppb_sts_points(11.2) == 3
        assert sppb_sts_points(13.6) == 3
        assert sppb_sts_points(13.7) == 2
        assert sppb_sts_points(16.6) == 2
        assert sppb_sts_points(16.7) == 1

    def test_fast_time_scores_four(self) -> None:
        assert sppb_sts_points(8.0) == 4

    def test_unable_scores_zero(self) -> None:
        assert sppb_sts_points(None) == 0


class TestAwgs19:
    def test_twelve_seconds_meets_the_cutoff(self) -> None:
        assert meets_awgs19_slow_sts(12.0) is True

    def test_just_under_does_not(self) -> None:
        assert meets_awgs19_slow_sts(11.9) is False

    def test_unknown_time_is_not_a_flag(self) -> None:
        assert meets_awgs19_slow_sts(None) is False


def _leg(hip_y: float) -> list:
    """Side-on leg whose hip angle shrinks as the person sits."""
    return make_pose({
        LANDMARK.RIGHT_HIP: visible(0.5, hip_y),
        LANDMARK.RIGHT_KNEE: visible(0.5, 0.6),
        LANDMARK.RIGHT_ANKLE: visible(0.5, 0.9),
    })


def _calibrated() -> ChairStandStrategy:
    strategy = ChairStandStrategy()
    strategy.reset()
    for _ in range(5):
        # Straight leg: hip, knee and ankle collinear -> 180 degrees.
        strategy.on_calibration_frame(_leg(0.3))
    ok, _ = strategy.finish_calibration()
    assert ok
    return strategy


def _do_stands(strategy: ChairStandStrategy, count: int, start_ms: float, interval_ms: float) -> None:
    """Drive `count` sit/stand cycles, one sit+stand per `interval_ms`."""
    t = start_ms
    for _ in range(count):
        strategy.update(_leg(0.62), t)          # sit: hip angle collapses
        strategy.update(_leg(0.3), t + interval_ms / 2)  # stand: back to straight
        t += interval_ms


class TestTimeToFiveStands:
    def test_times_from_first_sit_to_fifth_stand(self) -> None:
        strategy = _calibrated()
        _do_stands(strategy, 5, start_ms=1000.0, interval_ms=2000.0)
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
        assert outcome.reps == 5
        # First sit at 1000 ms, fifth stand at 1000 + 4*2000 + 1000 = 10000 ms.
        assert outcome.time_to_5_stands_s == 9.0
        assert outcome.sppb_sts_points == 4
        assert outcome.awgs19_slow_sts is False

    def test_slow_five_stands_flags_awgs19_and_escalates_risk(self) -> None:
        strategy = _calibrated()
        # First sit at 0 ms, fifth stand at 4.5 * 3000 = 13500 ms.
        _do_stands(strategy, 5, start_ms=0.0, interval_ms=3000.0)
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
        assert outcome.time_to_5_stands_s == 13.5
        assert outcome.sppb_sts_points == 3
        assert outcome.awgs19_slow_sts is True
        assert outcome.risk_level == "high"
        assert "screening indicator" in (outcome.interpretation or "")

    def test_full_duration_without_five_stands_scores_zero(self) -> None:
        strategy = _calibrated()
        _do_stands(strategy, 3, start_ms=0.0, interval_ms=3000.0)
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
        assert outcome.reps == 3
        assert outcome.time_to_5_stands_s is None
        assert outcome.sppb_sts_points == 0
        assert outcome.awgs19_slow_sts is True
        assert outcome.risk_level == "high"

    def test_stopping_early_does_not_claim_unable(self) -> None:
        strategy = _calibrated()
        _do_stands(strategy, 2, start_ms=0.0, interval_ms=2000.0)
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=True))
        assert outcome.sppb_sts_points is None
        assert outcome.awgs19_slow_sts is None
        assert outcome.risk_level != "high"

    def test_early_stop_after_five_stands_still_reports_timing(self) -> None:
        strategy = _calibrated()
        _do_stands(strategy, 5, start_ms=0.0, interval_ms=2000.0)
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=True))
        assert outcome.time_to_5_stands_s == 9.0
        assert outcome.sppb_sts_points == 4
