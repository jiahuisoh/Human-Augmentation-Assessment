"""Tests for sit-reach forward-axis geometry."""

from app.cv.types import Landmark
from app.tests.sit_reach.strategy import forward_reach_norm, forward_unit


def _v(x: float, y: float) -> Landmark:
    return Landmark(x, y, visibility=1.0)


class TestSitReachGeometry:
    def test_forward_unit_points_toward_toes(self) -> None:
        hip = _v(0.3, 0.5)
        ankle = _v(0.3, 0.9)
        toe = _v(0.55, 0.9)
        fwd = forward_unit(hip, ankle, toe)
        assert fwd[0] > 0
        assert abs(fwd[1]) < 0.01

    def test_forward_reach_zero_when_finger_at_toe(self) -> None:
        hip = _v(0.3, 0.5)
        ankle = _v(0.3, 0.9)
        toe = _v(0.55, 0.9)
        finger = _v(0.55, 0.9)
        fwd = forward_unit(hip, ankle, toe)
        assert forward_reach_norm(finger, toe, fwd) == 0.0

    def test_tilted_leg_axis_still_measures_forward_reach(self) -> None:
        hip = _v(0.30, 0.50)
        ankle = _v(0.36, 0.88)
        toe = _v(0.58, 0.86)
        finger = _v(0.68, 0.84)
        fwd = forward_unit(hip, ankle, toe)
        reach = forward_reach_norm(finger, toe, fwd)
        assert reach > 0.05
