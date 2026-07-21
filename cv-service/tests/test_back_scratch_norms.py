"""Unit tests for back-scratch norms.

Clinical convention: positive = fingertips overlap, negative = gap.
Bands are Rikli & Jones normal ranges (middle 50%) converted from inches.
"""

from app.tests.back_scratch.norms import classify_back_scratch


class TestClassifyBackScratch:
    def test_returns_none_without_age(self) -> None:
        assert classify_back_scratch(-5.0, None, "male") is None

    def test_male_60_band_matches_published_inches(self) -> None:
        # -6.5 in .. 0.0 in
        result = classify_back_scratch(-10.0, 62, "male")
        assert result is not None
        assert result.norm_low == -16.5
        assert result.norm_high == 0.0
        assert result.classification == "Average"

    def test_female_60_upper_bound_is_one_and_a_half_inches(self) -> None:
        # Regression: this band read 3.0 cm, but 1.5 in = 3.8 cm.
        result = classify_back_scratch(3.5, 62, "female")
        assert result is not None
        assert result.norm_high == 3.8
        assert result.classification == "Average"

    def test_female_65_lower_bound_is_three_and_a_half_inches(self) -> None:
        # Regression: this band read -10.0 cm, but -3.5 in = -8.9 cm.
        result = classify_back_scratch(-9.5, 67, "female")
        assert result is not None
        assert result.norm_low == -8.9
        assert result.classification == "Below Average"

    def test_male_80_lower_bound_is_nine_and_a_half_inches(self) -> None:
        # Regression: this band read -25.4 cm (-10.0 in), but -9.5 in = -24.1 cm.
        result = classify_back_scratch(-24.5, 82, "male")
        assert result is not None
        assert result.norm_low == -24.1
        assert result.classification == "Below Average"

    def test_overlapping_fingers_beats_the_band(self) -> None:
        result = classify_back_scratch(5.0, 62, "male")
        assert result is not None
        assert result.classification == "Above Average"
        assert result.risk_level == "low"

    def test_wide_gap_is_below_average(self) -> None:
        result = classify_back_scratch(-30.0, 62, "male")
        assert result is not None
        assert result.classification == "Below Average"


class TestNormRiskLevels:
    def test_average_is_low_risk(self) -> None:
        result = classify_back_scratch(-10.0, 62, "male")
        assert result is not None
        assert result.risk_level == "low"

    def test_below_average_is_moderate_not_high(self) -> None:
        result = classify_back_scratch(-40.0, 62, "male")
        assert result is not None
        assert result.risk_level == "moderate"
