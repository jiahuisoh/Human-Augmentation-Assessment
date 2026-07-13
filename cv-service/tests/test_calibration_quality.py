"""Tests for the calibration-quality score (normalised stdev of calibration samples)."""

from app.cv.landmarks import LANDMARK
from app.tests.back_scratch.strategy import BackScratchStrategy
from app.tests.base import calibration_quality_from_samples
from app.tests.chair_stand.strategy import ChairStandStrategy
from tests.helpers import make_pose, visible


class TestQualityFromSamples:
    def test_no_samples_returns_none(self) -> None:
        assert calibration_quality_from_samples([]) is None

    def test_single_sample_returns_none(self) -> None:
        assert calibration_quality_from_samples([0.2]) is None

    def test_steady_samples_score_high(self) -> None:
        samples = [0.200, 0.201, 0.199, 0.200, 0.202]
        quality = calibration_quality_from_samples(samples)
        assert quality is not None
        assert quality >= 0.9

    def test_noisy_samples_score_below_threshold(self) -> None:
        samples = [0.20, 0.30, 0.14, 0.27, 0.16]
        quality = calibration_quality_from_samples(samples)
        assert quality is not None
        assert quality < 0.5

    def test_quality_is_scale_invariant(self) -> None:
        small = [0.20, 0.21, 0.19, 0.20]
        large = [s * 100 for s in small]
        assert calibration_quality_from_samples(small) == calibration_quality_from_samples(large)

    def test_quality_clamped_to_zero_for_extreme_noise(self) -> None:
        assert calibration_quality_from_samples([0.05, 0.50, 0.02, 0.45]) == 0.0

    def test_non_positive_median_scores_zero(self) -> None:
        assert calibration_quality_from_samples([0.0, 0.0, 0.0]) == 0.0


def _back_scratch_pose(shoulder_width: float) -> list:
    return make_pose(
        {
            LANDMARK.LEFT_SHOULDER: visible(0.5 - shoulder_width / 2, 0.3),
            LANDMARK.RIGHT_SHOULDER: visible(0.5 + shoulder_width / 2, 0.3),
        },
    )


class TestStrategyQuality:
    def test_none_before_any_calibration_frames(self) -> None:
        strategy = BackScratchStrategy()
        strategy.reset()
        assert strategy.get_calibration_quality() is None

    def test_back_scratch_stable_shoulders_score_high(self) -> None:
        strategy = BackScratchStrategy()
        strategy.reset()
        for width in (0.200, 0.201, 0.199, 0.200):
            strategy.on_calibration_frame(_back_scratch_pose(width))
        quality = strategy.get_calibration_quality()
        assert quality is not None
        assert quality >= 0.9

    def test_back_scratch_jittery_shoulders_score_low(self) -> None:
        strategy = BackScratchStrategy()
        strategy.reset()
        for width in (0.20, 0.30, 0.14, 0.27):
            strategy.on_calibration_frame(_back_scratch_pose(width))
        quality = strategy.get_calibration_quality()
        assert quality is not None
        assert quality < 0.5

    def test_chair_stand_stable_angles_score_high(self) -> None:
        strategy = ChairStandStrategy()
        strategy.reset()
        pose = make_pose(
            {
                LANDMARK.RIGHT_HIP: visible(0.50, 0.50),
                LANDMARK.RIGHT_KNEE: visible(0.50, 0.70),
                LANDMARK.RIGHT_ANKLE: visible(0.50, 0.90),
            },
        )
        for _ in range(4):
            strategy.on_calibration_frame(pose)
        quality = strategy.get_calibration_quality()
        assert quality is not None
        assert quality >= 0.9
