"""Back scratch (shoulder flexibility) norms.

Norm source: Rikli & Jones, Senior Fitness Test Manual, 2nd ed. (2013),
n = 7,183 community-dwelling adults aged 60-94. Each band is the published
*normal range* = 25th-75th percentile (the middle 50%), converted from inches
to centimetres at 2.54 cm/in.

Convention: positive = fingertips OVERLAP, negative = gap between fingertips
(Rikli & Jones).

Known limitations, to state in any write-up:
  - This test is NOT part of the client's FFMOT battery. FFMOT Assessment 6
    is a single-arm behind-back positional test scored Red/Amber/Green; this
    two-handed version comes from the Senior Fitness Test. Confirm with the
    client which they want before relying on these results.
  - Rikli & Jones covers ages 60-94. Ages 55-59 are compared against the
    60-64 band and flagged `extrapolated`; outside 55-94 no band applies
    and the result is `out_of_range` (see app/tests/applicability.py).
  - Values are US-derived and may not transfer to a Singaporean population.
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
    male: tuple[float, float]
    female: tuple[float, float]

# Published inch values, converted at 2.54 cm/in:
#   male   60-64 -6.5..0.0   65-69 -7.5..-1.0  70-74 -8.0..-1.0  75-79 -9.0..-2.0
#          80-84 -9.5..-2.0  85-89 -10.0..-3.0 90-94 -10.5..-4.0
#   female 60-64 -3.0..1.5   65-69 -3.5..1.5   70-74 -4.0..1.0   75-79 -5.0..0.5
#          80-84 -5.5..0.0   85-89 -7.0..-1.0  90-94 -8.0..-1.0
_AGE_BANDS: tuple[_Band, ...] = (_Band(60, 64, (-16.5, 0.0), (-7.6, 3.8)), _Band(65, 69, (-19.1, -2.5), (-8.9, 3.8)), _Band(70, 74, (-20.3, -2.5), (-10.2, 2.5)), _Band(75, 79, (-22.9, -5.1), (-12.7, 1.3)), _Band(80, 84, (-24.1, -5.1), (-14.0, 0.0)), _Band(85, 89, (-25.4, -7.6), (-17.8, -2.5)), _Band(90, 94, (-26.7, -10.2), (-20.3, -2.5)))

@dataclass
class BackScratchClassification:
    classification: str
    risk_level: RiskLevel | None
    interpretation: str
    norm_low: float | None
    norm_high: float | None
    norm_applicability: NormApplicability

def classify_back_scratch(cm: float, age: int | None, sex: Sex) -> BackScratchClassification | None:
    applicability = applicability_for(age)
    if applicability is None:
        return None
    if applicability == 'out_of_range':
        return BackScratchClassification(classification=NOT_CLASSIFIABLE, risk_level=None, interpretation=out_of_range_interpretation(), norm_low=None, norm_high=None, norm_applicability=applicability)
    assert age is not None
    band = _pick_band(age)
    if sex == 'male':
        norm_low, norm_high = band.male
    elif sex == 'female':
        norm_low, norm_high = band.female
    else:
        norm_low = min(band.male[0], band.female[0])
        norm_high = max(band.male[1], band.female[1])
    if cm < norm_low:
        result = BackScratchClassification(classification='Below Average', risk_level='moderate', interpretation='Your reach is shorter than the middle 50% of people your age. Around a quarter of healthy adults score here. Daily shoulder and chest stretches can help.', norm_low=norm_low, norm_high=norm_high, norm_applicability=applicability)
    elif cm > norm_high:
        result = BackScratchClassification(classification='Above Average', risk_level='low', interpretation='Excellent shoulder flexibility for your age group.', norm_low=norm_low, norm_high=norm_high, norm_applicability=applicability)
    else:
        result = BackScratchClassification(classification='Average', risk_level='low', interpretation='Within the typical range for your age. Stretch regularly to maintain it.', norm_low=norm_low, norm_high=norm_high, norm_applicability=applicability)
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
