"""How far a Rikli & Jones norm band may be stretched beyond its source data.

The published tables cover ages 60-94 only. Presenting a 45-year-old's score
against the 60-64 band as though it were a valid comparison is a clinical
error: it flatters younger adults, because they are being measured against
people three decades older. Silent clamping is therefore not acceptable.

  in_range      60-94. The band is the published one.
  extrapolated  55-59. The 60-64 band is applied as the nearest available
                reference and MUST be surfaced as an approximation.
  out_of_range  Under 55 or over 94. No band applies; the raw score stands on
                its own and a clinician interprets it.

Mirrored in backend/src/utils/norms.js - change both or the classification the
client sees stops matching the one stored.
"""

from typing import Literal

NORM_MIN_AGE = 60
NORM_MAX_AGE = 94
EXTRAPOLATION_MIN_AGE = 55

NOT_CLASSIFIABLE = 'Not classifiable against Rikli & Jones norms'

_OUT_OF_RANGE_INTERPRETATION = (
    'The reference tables for this test cover ages 60 to 94, so there is no '
    'published range to compare this score against. The measurement itself is '
    'still valid - a clinician should interpret it.'
)
_EXTRAPOLATED_NOTE = (
    'Note: the reference tables start at age 60, so this has been compared '
    'against the 60-64 range as the nearest available. Treat it as indicative.'
)

NormApplicability = Literal['in_range', 'extrapolated', 'out_of_range']


def applicability_for(age: int | None) -> NormApplicability | None:
    """None when age is unknown, so the caller can skip classification entirely."""
    if age is None:
        return None
    if EXTRAPOLATION_MIN_AGE <= age < NORM_MIN_AGE:
        return 'extrapolated'
    if NORM_MIN_AGE <= age <= NORM_MAX_AGE:
        return 'in_range'
    return 'out_of_range'


def out_of_range_interpretation() -> str:
    return _OUT_OF_RANGE_INTERPRETATION


def extrapolated_note() -> str:
    return _EXTRAPOLATED_NOTE
