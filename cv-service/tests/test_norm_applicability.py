"""Rikli & Jones published norms for ages 60-94 only.

Before this rule, `_pick_band` silently clamped any age into the nearest band,
so a 45-year-old's chair-stand score was compared against 60-64-year-olds and
reported as a valid classification. That flatters younger adults against a
reference three decades older - a wrong clinical verdict delivered with full
confidence, which is worse than no verdict.
"""

import pytest

from app.tests.applicability import NOT_CLASSIFIABLE, applicability_for
from app.tests.back_scratch.norms import classify_back_scratch
from app.tests.chair_stand.norms import classify_chair_stand
from app.tests.sit_reach.norms import classify_sit_reach

# (classifier, a score comfortably inside the 60-64 band)
CLASSIFIERS = [
    pytest.param(classify_chair_stand, 16, id="chair_stand"),
    pytest.param(classify_sit_reach, 2.0, id="sit_reach"),
    pytest.param(classify_back_scratch, -8.0, id="back_scratch"),
]


class TestApplicabilityBoundaries:
    def test_unknown_age_has_no_applicability(self) -> None:
        assert applicability_for(None) is None

    @pytest.mark.parametrize("age", [54, 40, 0])
    def test_below_the_extrapolation_floor_is_out_of_range(self, age: int) -> None:
        assert applicability_for(age) == "out_of_range"

    @pytest.mark.parametrize("age", [55, 57, 59])
    def test_fifty_five_to_fifty_nine_is_extrapolated(self, age: int) -> None:
        assert applicability_for(age) == "extrapolated"

    @pytest.mark.parametrize("age", [60, 77, 94])
    def test_sixty_to_ninety_four_is_in_range(self, age: int) -> None:
        assert applicability_for(age) == "in_range"

    @pytest.mark.parametrize("age", [95, 101])
    def test_above_ninety_four_is_out_of_range(self, age: int) -> None:
        assert applicability_for(age) == "out_of_range"


@pytest.mark.parametrize("classify,score", CLASSIFIERS)
class TestEveryTestHonoursApplicability:
    def test_unknown_age_yields_no_classification(self, classify, score) -> None:
        assert classify(score, None, "male") is None

    def test_young_adult_is_not_classified_against_older_norms(self, classify, score) -> None:
        # The regression: this used to come back "Average" against the 60-64 band.
        result = classify(score, 45, "male")
        assert result is not None
        assert result.classification == NOT_CLASSIFIABLE
        assert result.norm_applicability == "out_of_range"
        assert result.norm_low is None and result.norm_high is None
        assert result.risk_level is None
        assert "60 to 94" in result.interpretation

    def test_very_old_adult_is_not_classified_either(self, classify, score) -> None:
        result = classify(score, 99, "male")
        assert result is not None
        assert result.norm_applicability == "out_of_range"
        assert result.norm_low is None

    def test_late_fifties_is_classified_but_flagged(self, classify, score) -> None:
        result = classify(score, 57, "male")
        assert result is not None
        assert result.norm_applicability == "extrapolated"
        assert result.classification != NOT_CLASSIFIABLE
        assert result.norm_low is not None
        # The approximation must be visible to whoever reads the result.
        assert "indicative" in result.interpretation

    def test_in_range_age_carries_no_caveat(self, classify, score) -> None:
        result = classify(score, 72, "male")
        assert result is not None
        assert result.norm_applicability == "in_range"
        assert "indicative" not in result.interpretation
        assert result.norm_low is not None

    def test_extrapolated_uses_the_youngest_band(self, classify, score) -> None:
        at_57 = classify(score, 57, "male")
        at_62 = classify(score, 62, "male")
        assert at_57 is not None and at_62 is not None
        assert (at_57.norm_low, at_57.norm_high) == (at_62.norm_low, at_62.norm_high)
