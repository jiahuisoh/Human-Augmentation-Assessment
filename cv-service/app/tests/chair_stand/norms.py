"""30-second chair stand norms.

Norm source: Rikli & Jones, Senior Fitness Test Manual, 2nd ed. (2013),
n = 7,183 community-dwelling adults aged 60-94. Each band is the published
*normal range* = 25th-75th percentile (the middle 50%), in number of stands.
The client's FFMOT battery (Assessment 1, "30 Second Chair Rise") is adapted
from Rikli & Jones and uses the same test protocol.

Known limitations, to state in any write-up:
  - Rikli & Jones covers ages 60-94. Ages 55-59 are compared against the
    60-64 band and flagged `extrapolated`; outside 55-94 no band applies
    and the result is `out_of_range` (see app/tests/applicability.py).
  - Values are US-derived. The Yishun SPPB study (Lee et al. 2021) shows
    physical-performance norms are population-specific, so these may
    misclassify Singaporean adults near the band edges.
  - The FFMOT protocol says to record whether the person pushed off with
    their arms; we do not detect or store that yet, and an arms-assisted
    score is not comparable to these norms.
"""

from dataclasses import dataclass
from app.cv.types import RiskLevel, Sex
from app.tests.applicability import (
    NOT_CLASSIFIABLE, NormApplicability, applicability_for,
    extrapolated_note, out_of_range_interpretation,
)

@dataclass(frozen=True)
class _Band:
    min_age: int
    max_age: int
    male: tuple[int, int]
    female: tuple[int, int]
_AGE_BANDS: tuple[_Band, ...] = (_Band(60, 64, (14, 19), (12, 17)), _Band(65, 69, (12, 18), (11, 16)), _Band(70, 74, (12, 17), (10, 15)), _Band(75, 79, (11, 17), (10, 15)), _Band(80, 84, (10, 15), (9, 14)), _Band(85, 89, (8, 14), (8, 13)), _Band(90, 94, (7, 12), (4, 11)))

@dataclass
class ChairStandClassification:
    classification: str
    risk_level: RiskLevel | None
    interpretation: str
    norm_low: int | None
    norm_high: int | None
    norm_applicability: NormApplicability

def classify_chair_stand(reps: int, age: int | None, sex: Sex) -> ChairStandClassification | None:
    applicability = applicability_for(age)
    if applicability is None:
        return None
    if applicability == 'out_of_range':
        return ChairStandClassification(classification=NOT_CLASSIFIABLE, risk_level=None, interpretation=out_of_range_interpretation(), norm_low=None, norm_high=None, norm_applicability=applicability)
    assert age is not None
    band = _pick_band(age)
    if sex == 'male':
        low, high = band.male
    elif sex == 'female':
        low, high = band.female
    else:
        low = min(band.male[0], band.female[0])
        high = max(band.male[1], band.female[1])
    # The band is the middle 50% of healthy older adults, so a quarter of them
    # fall below it by construction. Scoring below the band is a prompt to build
    # strength, not evidence of risk - `high` is reserved for the validated
    # SPPB/AWGS19 cut-off applied in the strategy's finalize().
    if reps < low:
        result = ChairStandClassification(classification='Below Average', risk_level='moderate', interpretation='Your score is below the middle 50% of people your age. Around a quarter of healthy adults score here. A lower-body strength programme would help.', norm_low=low, norm_high=high, norm_applicability=applicability)
    elif reps > high:
        result = ChairStandClassification(classification='Above Average', risk_level='low', interpretation='Excellent lower-body strength for your age group.', norm_low=low, norm_high=high, norm_applicability=applicability)
    else:
        result = ChairStandClassification(classification='Average', risk_level='low', interpretation='Within the typical range for your age. Regular strength exercises will help maintain or improve it.', norm_low=low, norm_high=high, norm_applicability=applicability)
    if applicability == 'extrapolated':
        result.interpretation = f'{result.interpretation} {extrapolated_note()}'
    return result

def _pick_band(age: int) -> _Band:
    if age < _AGE_BANDS[0].min_age:
        return _AGE_BANDS[0]
    if age > _AGE_BANDS[-1].max_age:
        return _AGE_BANDS[-1]
    for b in _AGE_BANDS:
        if b.min_age <= age <= b.max_age:
            return b
    return _AGE_BANDS[0]
