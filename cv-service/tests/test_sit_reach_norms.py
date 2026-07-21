"""Unit tests for sit-and-reach norms and FFMOT traffic-light scoring.

Clinical convention: positive = past the toes, negative = short of the toes.
"""

import pytest

from app.tests.sit_reach.norms import classify_sit_reach, traffic_light_for_reach


class TestClassifySitReach:
    def test_returns_none_without_age(self) -> None:
        assert classify_sit_reach(5.0, None, "male") is None

    def test_male_70_below_average_is_a_short_reach(self) -> None:
        result = classify_sit_reach(-10.0, 72, "male")
        assert result is not None
        assert result.classification == "Below Average"
        assert result.norm_low == -8.9
        assert result.norm_high == 6.4

    def test_male_70_average(self) -> None:
        result = classify_sit_reach(0.0, 72, "male")
        assert result is not None
        assert result.classification == "Average"

    def test_male_70_above_average_is_a_long_reach(self) -> None:
        result = classify_sit_reach(8.0, 72, "male")
        assert result is not None
        assert result.classification == "Above Average"
        assert result.risk_level == "low"

    def test_female_65_uses_female_band(self) -> None:
        result = classify_sit_reach(-2.0, 67, "female")
        assert result is not None
        assert result.norm_low == -1.3
        assert result.norm_high == 11.4
        assert result.classification == "Below Average"

    def test_other_sex_uses_widest_band(self) -> None:
        result = classify_sit_reach(9.0, 72, "other")
        assert result is not None
        assert result.norm_low == -8.9
        assert result.norm_high == 10.2
        assert result.classification == "Average"

    def test_late_fifties_borrows_the_youngest_band_as_an_approximation(self) -> None:
        result = classify_sit_reach(0.0, 55, "male")
        assert result is not None
        assert result.norm_applicability == "extrapolated"
        assert result.norm_low == -6.4
        assert result.norm_high == 10.2

    def test_age_beyond_the_tables_is_not_classified(self) -> None:
        # Previously clamped to the 90-94 band and reported as a real result.
        result = classify_sit_reach(0.0, 98, "female")
        assert result is not None
        assert result.norm_applicability == "out_of_range"
        assert result.norm_low is None
        assert result.norm_high is None


class TestNormRiskLevels:
    """Being inside the normal range must never read as elevated risk."""

    def test_average_is_low_risk(self) -> None:
        result = classify_sit_reach(0.0, 72, "male")
        assert result is not None
        assert result.risk_level == "low"

    def test_below_average_is_moderate_not_high(self) -> None:
        # A quarter of healthy adults fall below the band by construction, so
        # this band alone can never justify "high".
        result = classify_sit_reach(-30.0, 72, "male")
        assert result is not None
        assert result.risk_level == "moderate"


class TestTrafficLight:
    """FFMOT at-home booklet, Assessment 7 (Sit and Reach)."""

    KNEE_OFFSET = -25.0  # knee sits 25 cm behind the toes along the leg axis

    def test_reaching_past_the_toes_is_green(self) -> None:
        assert traffic_light_for_reach(4.0, self.KNEE_OFFSET) == "green"

    def test_touching_the_toes_is_green(self) -> None:
        assert traffic_light_for_reach(0.0, self.KNEE_OFFSET) == "green"

    def test_between_knee_and_toes_is_amber(self) -> None:
        assert traffic_light_for_reach(-10.0, self.KNEE_OFFSET) == "amber"

    def test_not_past_the_knee_is_red(self) -> None:
        assert traffic_light_for_reach(-30.0, self.KNEE_OFFSET) == "red"

    def test_exactly_at_the_knee_is_red(self) -> None:
        assert traffic_light_for_reach(-25.0, self.KNEE_OFFSET) == "red"

    def test_green_does_not_need_the_knee(self) -> None:
        assert traffic_light_for_reach(1.0, None) == "green"

    def test_returns_none_when_knee_unknown_and_short_of_toes(self) -> None:
        # Red and amber cannot be told apart without the knee position.
        assert traffic_light_for_reach(-10.0, None) is None

    @pytest.mark.parametrize("cm", [-0.1, -0.0001])
    def test_just_short_of_the_toes_is_not_green(self, cm: float) -> None:
        assert traffic_light_for_reach(cm, self.KNEE_OFFSET) == "amber"
