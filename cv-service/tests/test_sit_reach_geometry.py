"""Tests for sit-reach forward-axis geometry (reach measured along the leg axis)."""

from app.cv.types import Landmark
from app.tests.sit_reach.strategy import forward_reach_norm, forward_unit


def _v(x: float, y: float) -> Landmark:
    return Landmark(x, y, visibility=1.0)


class TestSitReachGeometry:
    def test_forward_unit_points_along_leg_toward_feet(self) -> None:
        hip = _v(0.30, 0.50)
        ankle = _v(0.70, 0.50)
        fwd = forward_unit(hip, ankle)
        assert fwd[0] > 0.99
        assert abs(fwd[1]) < 0.01

    def test_forward_reach_zero_when_finger_at_toe(self) -> None:
        hip = _v(0.30, 0.50)
        ankle = _v(0.70, 0.50)
        toe = _v(0.75, 0.50)
        fwd = forward_unit(hip, ankle)
        assert forward_reach_norm(toe, toe, fwd) == 0.0

    def test_finger_past_toe_is_positive(self) -> None:
        hip = _v(0.30, 0.50)
        ankle = _v(0.70, 0.50)
        toe = _v(0.75, 0.50)
        finger = _v(0.83, 0.52)
        fwd = forward_unit(hip, ankle)
        assert forward_reach_norm(finger, toe, fwd) > 0.05

    def test_tilted_leg_axis_still_measures_forward_reach(self) -> None:
        hip = _v(0.30, 0.50)
        ankle = _v(0.68, 0.62)
        toe = _v(0.72, 0.64)
        finger = _v(0.82, 0.67)
        fwd = forward_unit(hip, ankle)
        assert forward_reach_norm(finger, toe, fwd) > 0.05
