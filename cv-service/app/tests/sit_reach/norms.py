from dataclasses import dataclass
from app.cv.types import RiskLevel, Sex

@dataclass(frozen=True)
class _Band:
    min_age: int
    max_age: int
    male: tuple[float, float]
    female: tuple[float, float]


# Rikli & Jones senior fitness chair sit-and-reach style age bands (cm from toes).
_AGE_BANDS: tuple[_Band, ...] = (
    _Band(60, 64, (-6.4, 10.2), (-1.3, 12.7)),
    _Band(65, 69, (-7.6, 7.6), (-1.3, 11.4)),
    _Band(70, 74, (-8.9, 6.4), (-2.5, 10.2)),
    _Band(75, 79, (-10.2, 5.1), (-3.8, 8.9)),
    _Band(80, 84, (-14.0, 3.8), (-5.1, 7.6)),
    _Band(85, 89, (-14.0, 1.3), (-6.4, 6.4)),
    _Band(90, 94, (-16.5, 0.0), (-11.4, 2.5)),
)


@dataclass
class SitReachClassification:
    classification: str
    risk_level: RiskLevel
    interpretation: str
    norm_low: float
    norm_high: float


def classify_chair_sit_reach_position(
    cm: float | None,
    *,
    form_valid: bool,
    past_knee: bool,
) -> SitReachClassification:
    """Traffic-light positions for sit-and-reach (knee / toes landmarks).

    Position 1 (red): cannot straighten extended leg, or hands not past the knee.
    Position 2 (amber): hands between knee and toes.
    Position 3 (green): hands reach toes or beyond (0 cm or +).
    """
    if not form_valid or not past_knee or cm is None:
        return SitReachClassification(
            classification='Position 1',
            risk_level='high',
            interpretation=(
                "Position 1 — can't straighten the extended leg or get hands beyond the knee. "
                'Keep the test knee straight and reach past the knee before scoring.'
            ),
            norm_low=0.0,
            norm_high=0.0,
        )
    if cm < 0.0:
        return SitReachClassification(
            classification='Position 2',
            risk_level='moderate',
            interpretation=(
                f'Position 2 — hands reach between knee and toes ({cm:+.1f} cm from toes). '
                'Keep practising a slow hip hinge with a straight back.'
            ),
            norm_low=0.0,
            norm_high=0.0,
        )
    return SitReachClassification(
        classification='Position 3',
        risk_level='low',
        interpretation=(
            f'Position 3 — hands reach the toes or beyond ({cm:+.1f} cm). '
            'Good hamstring flexibility for daily tasks like tying shoelaces.'
        ),
        norm_low=0.0,
        norm_high=0.0,
    )


def classify_sit_reach(cm: float, age: int | None, sex: Sex) -> SitReachClassification | None:
    """Age/sex cm bands (senior fitness norms). Used as an optional supplement."""
    if age is None:
        return None
    band = _pick_band(age)
    if sex == 'male':
        low, high = band.male
    elif sex == 'female':
        low, high = band.female
    else:
        low = min(band.male[0], band.female[0])
        high = max(band.male[1], band.female[1])
    if cm < low:
        return SitReachClassification(
            classification='Below Average',
            risk_level='high',
            interpretation=(
                'Your lower-body flexibility is below the typical range for your age. '
                'Regular hamstring and lower-back stretches will help.'
            ),
            norm_low=low,
            norm_high=high,
        )
    if cm > high:
        return SitReachClassification(
            classification='Above Average',
            risk_level='low',
            interpretation='Excellent lower-body flexibility for your age group.',
            norm_low=low,
            norm_high=high,
        )
    return SitReachClassification(
        classification='Average',
        risk_level='moderate',
        interpretation='Within the typical range. Daily stretches will help maintain it.',
        norm_low=low,
        norm_high=high,
    )


def _pick_band(age: int) -> _Band:
    if age < _AGE_BANDS[0].min_age:
        return _AGE_BANDS[0]
    if age > _AGE_BANDS[-1].max_age:
        return _AGE_BANDS[-1]
    for b in _AGE_BANDS:
        if b.min_age <= age <= b.max_age:
            return b
    return _AGE_BANDS[0]
