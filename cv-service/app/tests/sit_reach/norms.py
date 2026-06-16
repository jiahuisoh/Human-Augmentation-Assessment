from dataclasses import dataclass
from app.cv.types import RiskLevel, Sex

@dataclass(frozen=True)
class _Band:
    min_age: int
    max_age: int
    male: tuple[float, float]
    female: tuple[float, float]
_AGE_BANDS: tuple[_Band, ...] = (_Band(60, 64, (-6.4, 10.2), (-1.3, 12.7)), _Band(65, 69, (-7.6, 7.6), (-1.3, 11.4)), _Band(70, 74, (-8.9, 6.4), (-2.5, 10.2)), _Band(75, 79, (-10.2, 5.1), (-3.8, 8.9)), _Band(80, 84, (-14.0, 3.8), (-5.1, 7.6)), _Band(85, 89, (-14.0, 1.3), (-6.4, 6.4)), _Band(90, 94, (-16.5, 0.0), (-11.4, 2.5)))

@dataclass
class SitReachClassification:
    classification: str
    risk_level: RiskLevel
    interpretation: str
    norm_low: float
    norm_high: float

def classify_sit_reach(cm: float, age: int | None, sex: Sex) -> SitReachClassification | None:
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
    norm_low = -high
    norm_high = -low
    if cm > norm_high:
        return SitReachClassification(classification='Below Average', risk_level='high', interpretation='Your lower-body flexibility is below the typical range. Regular hamstring and lower-back stretches will help.', norm_low=norm_low, norm_high=norm_high)
    if cm < norm_low:
        return SitReachClassification(classification='Above Average', risk_level='low', interpretation='Excellent lower-body flexibility for your age group.', norm_low=norm_low, norm_high=norm_high)
    return SitReachClassification(classification='Average', risk_level='moderate', interpretation='Within the typical range. Daily stretches will help maintain it.', norm_low=norm_low, norm_high=norm_high)

def _pick_band(age: int) -> _Band:
    if age < _AGE_BANDS[0].min_age:
        return _AGE_BANDS[0]
    if age > _AGE_BANDS[-1].max_age:
        return _AGE_BANDS[-1]
    for b in _AGE_BANDS:
        if b.min_age <= age <= b.max_age:
            return b
    return _AGE_BANDS[0]
