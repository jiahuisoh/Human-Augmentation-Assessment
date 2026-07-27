"""Tests for sit-reach forward-axis geometry."""

from app.cv.types import Landmark
from app.tests.sit_reach.strategy import (
    TOE_LINE_BACK_FRACTION,
    forward_reach_norm,
    forward_unit,
    toe_line_landmark,
)


def _v(x: float, y: float) -> Landmark:
    return Landmark(x, y, visibility=1.0)


class TestSitReachGeometry:
    def test_forward_unit_points_toward_toes(self) -> None:
        hip = _v(0.30, 0.55)
        ankle = _v(0.70, 0.55)
        toe = _v(0.78, 0.55)
        fwd = forward_unit(hip, ankle, toe)
        assert fwd[0] > 0.99
        assert abs(fwd[1]) < 0.01

    def test_forward_reach_zero_when_finger_at_toe(self) -> None:
        hip = _v(0.30, 0.55)
        ankle = _v(0.70, 0.55)
        toe = _v(0.78, 0.55)
        finger = _v(0.78, 0.55)
        fwd = forward_unit(hip, ankle, toe)
        assert forward_reach_norm(finger, toe, fwd) == 0.0

    def test_short_of_toes_is_negative(self) -> None:
        hip = _v(0.30, 0.55)
        ankle = _v(0.70, 0.55)
        toe = _v(0.78, 0.55)
        finger = _v(0.70, 0.50)
        fwd = forward_unit(hip, ankle, toe)
        assert forward_reach_norm(finger, toe, fwd) < 0

    def test_tilted_leg_axis_still_measures_forward_reach(self) -> None:
        hip = _v(0.30, 0.50)
        ankle = _v(0.68, 0.58)
        toe = _v(0.76, 0.60)
        finger = _v(0.86, 0.62)
        fwd = forward_unit(hip, ankle, toe)
        reach = forward_reach_norm(finger, toe, fwd)
        assert reach > 0.05

    def test_toe_line_is_between_ankle_and_tip(self) -> None:
        ankle = _v(0.70, 0.55)
        tip = _v(0.78, 0.55)
        line = toe_line_landmark(ankle, tip)
        assert ankle.x < line.x < tip.x
        expected = tip.x + (ankle.x - tip.x) * TOE_LINE_BACK_FRACTION
        assert abs(line.x - expected) < 1e-9

    def test_finger_at_toe_line_is_zero(self) -> None:
        hip = _v(0.30, 0.55)
        ankle = _v(0.70, 0.55)
        tip = _v(0.78, 0.55)
        line = toe_line_landmark(ankle, tip)
        fwd = forward_unit(hip, ankle, tip)
        assert abs(forward_reach_norm(line, line, fwd)) < 1e-9
