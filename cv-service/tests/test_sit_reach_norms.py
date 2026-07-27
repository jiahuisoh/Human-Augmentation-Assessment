"""Unit tests for sit-and-reach age/sex and traffic-light classification."""

from app.tests.sit_reach.norms import classify_chair_sit_reach_position, classify_sit_reach


class TestChairSitReachPosition:
    def test_position_1_when_form_invalid(self) -> None:
        result = classify_chair_sit_reach_position(5.0, form_valid=False, past_knee=True)
        assert result.classification == "Position 1"
        assert result.risk_level == "high"

    def test_position_1_when_not_past_knee(self) -> None:
        result = classify_chair_sit_reach_position(-20.0, form_valid=True, past_knee=False)
        assert result.classification == "Position 1"

    def test_position_2_between_knee_and_toes(self) -> None:
        result = classify_chair_sit_reach_position(-8.0, form_valid=True, past_knee=True)
        assert result.classification == "Position 2"
        assert result.risk_level == "moderate"

    def test_position_3_at_or_past_toes(self) -> None:
        result = classify_chair_sit_reach_position(0.0, form_valid=True, past_knee=True)
        assert result.classification == "Position 3"
        assert result.risk_level == "low"
        result2 = classify_chair_sit_reach_position(4.0, form_valid=True, past_knee=True)
        assert result2.classification == "Position 3"


class TestClassifySitReach:
    def test_returns_none_without_age(self) -> None:
        assert classify_sit_reach(5.0, None, "male") is None

    def test_male_70_below_average(self) -> None:
        result = classify_sit_reach(-10.0, 72, "male")
        assert result is not None
        assert result.classification == "Below Average"
        assert result.risk_level == "high"
        assert result.norm_low == -8.9
        assert result.norm_high == 6.4

    def test_male_70_average(self) -> None:
        result = classify_sit_reach(0.0, 72, "male")
        assert result is not None
        assert result.classification == "Average"
        assert result.risk_level == "moderate"

    def test_male_70_above_average(self) -> None:
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
        result = classify_sit_reach(-12.0, 72, "other")
        assert result is not None
        # Age 70–74 band: min(male low, female low), max(male high, female high)
        assert result.norm_low == -8.9
        assert result.norm_high == 10.2
        assert result.classification == "Below Average"

    def test_age_below_range_clamps_to_youngest_band(self) -> None:
        result = classify_sit_reach(0.0, 55, "male")
        assert result is not None
        assert result.norm_low == -6.4
        assert result.norm_high == 10.2

    def test_age_above_range_clamps_to_oldest_band(self) -> None:
        result = classify_sit_reach(0.0, 98, "female")
        assert result is not None
        assert result.norm_low == -11.4
        assert result.norm_high == 2.5
