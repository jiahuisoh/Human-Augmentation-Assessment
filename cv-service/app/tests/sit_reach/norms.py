"""Chair sit-and-reach norms and FFMOT traffic-light scoring.

Norm source: Rikli & Jones, Senior Fitness Test Manual, 2nd ed. (2013),
n = 7,183 community-dwelling adults aged 60-94. Each band is the published
*normal range* = 25th-75th percentile (the middle 50%), converted from inches
to centimetres. The Functional Fitness MOT battery that the client uses is
itself adapted from Rikli & Jones, so these are the parent battery's values.

Convention: positive = reached PAST the toes, negative = short of the toes
(FFMOT protocol, "Chair Sit & Reach"; matches Rikli & Jones).

Known limitations, to state in any write-up:
  - Rikli & Jones covers ages 60-94. Ages 55-59 are compared against the
    60-64 band and flagged `extrapolated`; outside 55-94 no band applies
    and the result is `out_of_range` (see app/tests/applicability.py).
  - Values are US-derived. The Yishun SPPB study (Lee et al. 2021) shows
    physical-performance norms are population-specific, so these may
    misclassify Singaporean adults near the band edges.
"""

from dataclasses import dataclass
from app.cv.types import RiskLevel, Sex, TrafficLight
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
#   male   60-64 -2.5..4.0   65-69 -3.0..3.0   70-74 -3.5..2.5  75-79 -4.0..2.0
#          80-84 -5.5..1.5   85-89 -5.5..0.5   90-94 -6.5..0.0
#   female 60-64 -0.5..5.0   65-69 -0.5..4.5   70-74 -1.0..4.0  75-79 -1.5..3.5
#          80-84 -2.0..3.0   85-89 -2.5..2.5   90-94 -4.5..1.0
_AGE_BANDS: tuple[_Band, ...] = (_Band(60, 64, (-6.4, 10.2), (-1.3, 12.7)), _Band(65, 69, (-7.6, 7.6), (-1.3, 11.4)), _Band(70, 74, (-8.9, 6.4), (-2.5, 10.2)), _Band(75, 79, (-10.2, 5.1), (-3.8, 8.9)), _Band(80, 84, (-14.0, 3.8), (-5.1, 7.6)), _Band(85, 89, (-14.0, 1.3), (-6.4, 6.4)), _Band(90, 94, (-16.5, -1.3), (-11.4, 2.5)))

@dataclass
class SitReachClassification:
    classification: str
    risk_level: RiskLevel | None
    interpretation: str
    norm_low: float | None
    norm_high: float | None
    norm_applicability: NormApplicability

def classify_sit_reach(cm: float, age: int | None, sex: Sex) -> SitReachClassification | None:
    applicability = applicability_for(age)
    if applicability is None:
        return None
    if applicability == 'out_of_range':
        return SitReachClassification(classification=NOT_CLASSIFIABLE, risk_level=None, interpretation=out_of_range_interpretation(), norm_low=None, norm_high=None, norm_applicability=applicability)
    assert age is not None
    band = _pick_band(age)
    if sex == 'male':
        norm_low, norm_high = band.male
    elif sex == 'female':
        norm_low, norm_high = band.female
    else:
        norm_low = min(band.male[0], band.female[0])
        norm_high = max(band.male[1], band.female[1])
    # The band is the middle 50% of healthy older adults, so a quarter of them
    # fall below it by construction. Scoring below the band is a prompt to work
    # on flexibility, not evidence of risk - `high` is reserved for validated
    # clinical thresholds, which this test does not have.
    if cm < norm_low:
        result = SitReachClassification(classification='Below Average', risk_level='moderate', interpretation='Your reach is shorter than the middle 50% of people your age. Around a quarter of healthy adults score here. Regular hamstring and lower-back stretches will help.', norm_low=norm_low, norm_high=norm_high, norm_applicability=applicability)
    elif cm > norm_high:
        result = SitReachClassification(classification='Above Average', risk_level='low', interpretation='Excellent lower-body flexibility for your age group.', norm_low=norm_low, norm_high=norm_high, norm_applicability=applicability)
    else:
        result = SitReachClassification(classification='Average', risk_level='low', interpretation='Within the typical range for your age. Daily stretches will help maintain it.', norm_low=norm_low, norm_high=norm_high, norm_applicability=applicability)
    if applicability == 'extrapolated':
        result.interpretation = f'{result.interpretation} {extrapolated_note()}'
    return result


def traffic_light_for_reach(cm: float, knee_offset_cm: float | None) -> TrafficLight | None:
    """FFMOT at-home booklet scoring (Assessment 7, Sit and Reach).

    green  - Position 3: hands reach the toes or beyond.
    amber  - Position 2: hands reach between the knee and the toes.
    red    - Position 1: hands cannot get beyond the knee.

    `knee_offset_cm` is the knee's position along the leg axis relative to the
    toes, so it is normally negative. Returns None when the knee was never
    visible, since red/amber cannot be told apart without it.

    Note: the booklet's Position 1 also covers "can't straighten the extended
    leg", which needs a knee-extension gate we do not implement yet.
    """
    if cm >= 0:
        return 'green'
    if knee_offset_cm is None:
        return None
    return 'amber' if cm > knee_offset_cm else 'red'


def _pick_band(age: int) -> _Band:
    if age < _AGE_BANDS[0].min_age:
        return _AGE_BANDS[0]
    if age > _AGE_BANDS[-1].max_age:
        return _AGE_BANDS[-1]
    for b in _AGE_BANDS:
        if b.min_age <= age <= b.max_age:
            return b
    return _AGE_BANDS[0]
