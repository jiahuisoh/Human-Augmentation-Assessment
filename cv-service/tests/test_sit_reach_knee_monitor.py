"""The chair sit-and-reach protocol requires the extended knee to stay straight.

Bending it lets the hands travel further with no gain in hamstring length -
precisely the compensation the test exists to exclude - so an unflagged bent
knee reads as better flexibility than the person has.

We record the flag; we never void the trial. That call is the clinician's, and
FFMOT is explicit that arm/leg compensations are documented rather than used to
throw the score away.
"""

import pytest

from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import _MIN_STRAIGHT_KNEE_DEG, SitReachStrategy
from tests.helpers import sit_reach_side_pose

_HEIGHT_CM = 170.0


def _pose(knee_x: float, finger_y: float = 0.70):
    """Leg down the image; knee_x pushes the knee off the hip-ankle line."""
    return sit_reach_side_pose(
        hip=(0.5, 0.20), knee=(knee_x, 0.40), ankle=(0.5, 0.60),
        toe=(0.5, 0.65), finger=(0.5, finger_y),
    )


def _run(knee_x: float, frames: int = 14):
    strategy = SitReachStrategy()
    strategy.on_init(70, "male", _HEIGHT_CM)
    strategy.reset()
    for _ in range(3):
        strategy.on_calibration_frame(_pose(knee_x))
    ok, reason = strategy.finish_calibration()
    assert ok, reason
    last = None
    for i in range(frames):
        last = strategy.update(_pose(knee_x), i * 300.0)
    outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
    return last, outcome


class TestKneeAngleGate:
    def test_threshold_matches_the_protocol_specification(self) -> None:
        assert _MIN_STRAIGHT_KNEE_DEG == 172.0

    def test_straight_leg_is_not_flagged(self) -> None:
        # Knee on the hip-ankle line: 180 degrees.
        live, outcome = _run(knee_x=0.5)
        assert live is not None
        assert live.knee_bent is False
        assert outcome.knee_bent is False

    def test_clearly_bent_knee_is_flagged(self) -> None:
        live, outcome = _run(knee_x=0.62)
        assert live is not None
        assert live.knee_bent is True
        assert outcome.knee_bent is True

    def test_a_bent_knee_does_not_void_the_measurement(self) -> None:
        # The score still stands; only the clinician may discard it.
        _live, outcome = _run(knee_x=0.62)
        assert outcome.measurement is not None
        assert outcome.classification is not None

    def test_flag_is_unknown_when_the_knee_cannot_be_seen(self) -> None:
        strategy = SitReachStrategy()
        strategy.on_init(70, "male", _HEIGHT_CM)
        strategy.reset()
        visible = _pose(0.5)
        for _ in range(3):
            strategy.on_calibration_frame(visible)
        assert strategy.finish_calibration()[0]
        hidden = list(visible)
        from app.cv.landmarks import LANDMARK
        from app.cv.types import Landmark
        hidden[LANDMARK.RIGHT_KNEE] = Landmark(0.5, 0.4, visibility=0.0)
        for i in range(14):
            live = strategy.update(hidden, i * 300.0)
        assert live.knee_bent is None
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
        assert outcome.knee_bent is None

    def test_flag_describes_the_scored_hold_not_the_whole_test(self) -> None:
        strategy = SitReachStrategy()
        strategy.on_init(70, "male", _HEIGHT_CM)
        strategy.reset()
        for _ in range(3):
            strategy.on_calibration_frame(_pose(0.5))
        assert strategy.finish_calibration()[0]
        # Straight-knee frames reaching far, then a bent-knee stretch that does
        # NOT beat it. The recorded flag must belong to the winning hold.
        t = 0.0
        for _ in range(14):
            strategy.update(_pose(0.5, finger_y=0.75), t); t += 300.0
        for _ in range(14):
            strategy.update(_pose(0.62, finger_y=0.68), t); t += 300.0
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
        assert outcome.knee_bent is False
