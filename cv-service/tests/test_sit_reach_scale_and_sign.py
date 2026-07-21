"""End-to-end sit-reach checks: calibration scale and clinical sign convention.

Geometry used throughout: the person sits side-on with the test leg pointing
straight down the image (+y), so the forward axis is (0, 1) and reach is just
the vertical gap between fingertip and toe.

  hip (0.5, 0.20)  knee (0.5, 0.40)  ankle (0.5, 0.60)  toe (0.5, 0.65)

With height 170 cm the calibrated leg is 170 * 0.491 = 83.47 cm over 0.4
normalised units, i.e. 208.675 cm per unit.
"""

import pytest

from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import (
    ANKLE_HEIGHT_FRACTION_OF_HEIGHT,
    HIP_HEIGHT_FRACTION_OF_HEIGHT,
    LEG_LENGTH_FRACTION_OF_HEIGHT,
    SitReachStrategy,
)
from tests.helpers import sit_reach_side_pose

_HEIGHT_CM = 170.0
_CM_PER_UNIT = (_HEIGHT_CM * LEG_LENGTH_FRACTION_OF_HEIGHT) / 0.4


def _pose(finger_y: float):
    return sit_reach_side_pose(
        hip=(0.5, 0.20), knee=(0.5, 0.40), ankle=(0.5, 0.60),
        toe=(0.5, 0.65), finger=(0.5, finger_y),
    )


def _run(finger_y: float, frames: int = 12, step_ms: float = 300.0):
    strategy = SitReachStrategy()
    strategy.on_init(70, "male", _HEIGHT_CM)
    strategy.reset()
    for _ in range(3):
        strategy.on_calibration_frame(_pose(finger_y))
    ok, reason = strategy.finish_calibration()
    assert ok, reason
    for i in range(frames):
        strategy.update(_pose(finger_y), i * step_ms)
    return strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))


class TestCalibrationScale:
    def test_leg_fraction_is_hip_to_ankle_not_hip_to_floor(self) -> None:
        # 0.530 H is the hip joint above the FLOOR; the ankle landmark sits
        # 0.039 H up, so the hip->ankle segment we measure is the difference.
        assert LEG_LENGTH_FRACTION_OF_HEIGHT == pytest.approx(0.491)
        assert LEG_LENGTH_FRACTION_OF_HEIGHT == pytest.approx(
            HIP_HEIGHT_FRACTION_OF_HEIGHT - ANKLE_HEIGHT_FRACTION_OF_HEIGHT
        )

    def test_hip_to_floor_fraction_would_inflate_by_about_eight_percent(self) -> None:
        inflation = HIP_HEIGHT_FRACTION_OF_HEIGHT / LEG_LENGTH_FRACTION_OF_HEIGHT
        assert inflation == pytest.approx(1.079, abs=0.001)


class TestClinicalSignConvention:
    def test_reaching_past_the_toes_is_positive(self) -> None:
        outcome = _run(finger_y=0.70)
        assert outcome.measurement is not None
        assert outcome.measurement > 0
        assert outcome.measurement == pytest.approx(0.05 * _CM_PER_UNIT, abs=0.1)

    def test_short_of_the_toes_is_negative(self) -> None:
        outcome = _run(finger_y=0.60)
        assert outcome.measurement is not None
        assert outcome.measurement < 0
        assert outcome.measurement == pytest.approx(-0.05 * _CM_PER_UNIT, abs=0.1)

    def test_fingertips_at_the_toes_is_zero(self) -> None:
        outcome = _run(finger_y=0.65)
        assert outcome.measurement == pytest.approx(0.0, abs=0.1)

    def test_best_measurement_keeps_the_furthest_reach(self) -> None:
        strategy = SitReachStrategy()
        strategy.on_init(70, "male", _HEIGHT_CM)
        strategy.reset()
        for _ in range(3):
            strategy.on_calibration_frame(_pose(0.65))
        assert strategy.finish_calibration()[0]
        # Reach out to +y, then come back short; the best must be the furthest.
        for i in range(12):
            strategy.update(_pose(0.70), i * 300.0)
        for i in range(12, 24):
            strategy.update(_pose(0.60), i * 300.0)
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=False))
        assert outcome.measurement is not None
        assert outcome.measurement > 0


class TestNoDataSentinel:
    def test_measurement_is_none_when_nothing_scored(self) -> None:
        # 0.0 cm means "fingertips at the toes", so it must not double as
        # a no-data value.
        strategy = SitReachStrategy()
        strategy.on_init(70, "male", _HEIGHT_CM)
        strategy.reset()
        for _ in range(3):
            strategy.on_calibration_frame(_pose(0.65))
        assert strategy.finish_calibration()[0]
        outcome = strategy.finalize(FinalizeContext(user_age=70, user_sex="male", terminated_early=True))
        assert outcome.measurement is None


class TestTrafficLightEndToEnd:
    def test_past_the_toes_is_green(self) -> None:
        assert _run(finger_y=0.70).traffic_light == "green"

    def test_between_knee_and_toes_is_amber(self) -> None:
        assert _run(finger_y=0.60).traffic_light == "amber"

    def test_not_past_the_knee_is_red(self) -> None:
        assert _run(finger_y=0.35).traffic_light == "red"
