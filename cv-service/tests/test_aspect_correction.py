"""MediaPipe normalises x by image WIDTH and y by image HEIGHT, so on any
non-square frame the same physical length produces a different number depending
on its direction.

That matters differently per test:

  back_scratch  (side-on) calibrates on trunk length (shoulder->hip, VERTICAL)
                and measures a mostly-vertical fingertip gap - near-parallel
                axes, so the distortion largely cancels like sit-reach. (The
                old face-on design calibrated on horizontal shoulder width and
                measured a vertical gap - perpendicular, +33% on 640x480.)
  sit_reach     projects the reach onto the same hip->ankle axis it calibrated
                on, so the distortion cancels regardless of leg angle.
  chair_stand   measures a knee ANGLE, which anisotropic scaling skews for
                anything that is not axis-aligned.

apply_aspect() puts both axes in units of image height so plain hypot() and
angles are geometrically valid again.
"""

import math

import pytest

from app.cv.landmarks import LANDMARK, apply_aspect, landmarks_to_wire, angle_between, distance
from app.cv.types import Landmark
from app.tests.back_scratch.strategy import BackScratchStrategy
from app.tests.sit_reach.strategy import forward_reach_norm, forward_unit

WIDTH, HEIGHT = 640, 480
ASPECT = WIDTH / HEIGHT
PX_PER_CM = 5.0


def _nx(cm: float) -> float:
    return cm * PX_PER_CM / WIDTH


def _ny(cm: float) -> float:
    return cm * PX_PER_CM / HEIGHT


def _v(x: float, y: float) -> Landmark:
    return Landmark(x, y, visibility=1.0)


class TestApplyAspect:
    def test_square_frames_are_left_alone(self) -> None:
        marks = [_v(0.25, 0.75)]
        assert apply_aspect(marks, 1.0)[0].x == pytest.approx(0.25)

    def test_x_is_scaled_into_units_of_image_height(self) -> None:
        corrected = apply_aspect([_v(0.5, 0.5)], ASPECT)[0]
        assert corrected.x == pytest.approx(0.5 * ASPECT)
        assert corrected.y == pytest.approx(0.5)

    def test_equal_physical_lengths_measure_equal_after_correction(self) -> None:
        # A 20 cm horizontal span and a 20 cm vertical span.
        horizontal = apply_aspect([_v(0, 0), _v(_nx(20), 0)], ASPECT)
        vertical = apply_aspect([_v(0, 0), _v(0, _ny(20))], ASPECT)
        assert distance(*horizontal) == pytest.approx(distance(*vertical), rel=1e-9)

    def test_without_correction_they_do_not_match(self) -> None:
        horizontal = [_v(0, 0), _v(_nx(20), 0)]
        vertical = [_v(0, 0), _v(0, _ny(20))]
        assert distance(*vertical) == pytest.approx(distance(*horizontal) * ASPECT)

    def test_wire_conversion_undoes_the_correction(self) -> None:
        original = _v(0.4, 0.6)
        corrected = apply_aspect([original], ASPECT)
        assert landmarks_to_wire(corrected, ASPECT)[0][:2] == [0.4, 0.6]

    def test_right_angles_survive_correction(self) -> None:
        # Seated: thigh horizontal, shin vertical -> a true 90 degrees.
        pts = apply_aspect([_v(_nx(-40), 0), _v(0, 0), _v(0, _ny(40))], ASPECT)
        assert angle_between(*pts) == pytest.approx(90.0, abs=0.01)

    def test_oblique_angles_are_skewed_without_correction(self) -> None:
        raw = [_v(_nx(-40), 0), _v(0, 0), _v(_nx(40), _ny(40))]
        corrected = apply_aspect(raw, ASPECT)
        assert angle_between(*corrected) == pytest.approx(135.0, abs=0.01)
        assert abs(angle_between(*raw) - 135.0) > 5.0


class TestBackScratchTrunkCalibration:
    """The side-on redesign calibrates on trunk length (shoulder -> hip), which
    is VERTICAL, and the fingertip gap side-on is mostly vertical too. Parallel
    axes mean the aspect distortion cancels (as it does for sit-reach), on top of
    the global apply_aspect correction. Regression guard for the new design."""

    def _calibrated(self, aspect: float, height_cm: float = 170.0) -> BackScratchStrategy:
        strategy = BackScratchStrategy()
        strategy.reset()
        strategy.on_init(70, "male", height_cm)
        trunk_cm = height_cm * 0.288  # matches SHOULDER_TO_HIP_FRACTION_OF_HEIGHT
        # A vertical shoulder -> hip segment of the true trunk length.
        seg = apply_aspect([_v(0.5, 0.2), _v(0.5, 0.2 + _ny(trunk_cm))], aspect)
        marks = [Landmark(0.0, 0.0, visibility=0.0) for _ in range(33)]
        marks[LANDMARK.RIGHT_SHOULDER], marks[LANDMARK.RIGHT_HIP] = seg
        for _ in range(5):
            strategy.on_calibration_frame(marks)
        ok, reason = strategy.finish_calibration()
        assert ok, reason
        return strategy

    def _vertical_gap_cm(self, strategy: BackScratchStrategy, gap_cm: float, aspect: float) -> float:
        tips = apply_aspect([_v(0.5, 0.4), _v(0.5, 0.4 + _ny(gap_cm))], aspect)
        return abs(strategy._signed_score_cm(tips[0], tips[0], tips[1], tips[1]))

    def test_corrected_measures_the_true_gap(self) -> None:
        strategy = self._calibrated(ASPECT)
        assert self._vertical_gap_cm(strategy, 10.0, ASPECT) == pytest.approx(10.0, rel=0.01)

    def test_vertical_gap_is_aspect_robust_even_without_correction(self) -> None:
        # Trunk (vertical) and gap (vertical) are both scaled by 1/imageHeight,
        # so the ratio is aspect-independent - the same cancellation sit-reach
        # gets from projecting onto its calibration axis.
        strategy = self._calibrated(1.0)
        assert self._vertical_gap_cm(strategy, 10.0, 1.0) == pytest.approx(10.0, rel=0.01)


class TestSitReachCancelsTheDistortion:
    """Projecting onto the calibration axis makes this test aspect-immune. Kept
    as a guard: a 'fix' that measured off-axis would silently break it."""

    @pytest.mark.parametrize("leg", [(60.0, 0.0), (52.0, 30.0), (30.0, 52.0), (0.0, 60.0)])
    def test_reach_is_exact_at_any_leg_angle_without_correction(self, leg: tuple[float, float]) -> None:
        lx, ly = leg
        hip, ankle = _v(0.0, 0.0), _v(_nx(lx), _ny(ly))
        fwd = forward_unit(hip, ankle)
        cm_per_unit = math.hypot(lx, ly) / math.hypot(ankle.x, ankle.y)
        reach_fraction = 0.2
        finger = _v(_nx(lx * reach_fraction), _ny(ly * reach_fraction))
        measured = forward_reach_norm(finger, hip, fwd) * cm_per_unit
        assert measured == pytest.approx(math.hypot(lx, ly) * reach_fraction, rel=1e-6)
