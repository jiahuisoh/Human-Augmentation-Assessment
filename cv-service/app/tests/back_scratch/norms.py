from dataclasses import dataclass
from app.cv.types import RiskLevel, Sex

@dataclass(frozen=True)
class _Band:
    min_age: int
    max_age: int
    male: tuple[float, float]
    female: tuple[float, float]
_AGE_BANDS: tuple[_Band, ...] = (_Band(60, 64, (-16.5, 0.0), (-7.6, 3.0)), _Band(65, 69, (-19.0, -2.5), (-10.0, 3.0)), _Band(70, 74, (-20.3, -2.5), (-10.2, 3.0)), _Band(75, 79, (-22.9, -5.1), (-12.7, 2.0)), _Band(80, 84, (-25.4, -5.1), (-14.0, 1.0)), _Band(85, 89, (-25.4, -7.6), (-17.8, 0.0)), _Band(90, 94, (-26.7, -10.2), (-20.3, -2.5)))

@dataclass
class BackScratchClassification:
    classification: str
    risk_level: RiskLevel
    interpretation: str
    norm_low: float
    norm_high: float

def classify_back_scratch(cm: float, age: int | None, sex: Sex) -> BackScratchClassification | None:
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
        return BackScratchClassification(classification='Below Average', risk_level='high', interpretation='Your shoulder flexibility is below the typical range. Daily shoulder and chest stretches can help.', norm_low=norm_low, norm_high=norm_high)
    if cm < norm_low:
        return BackScratchClassification(classification='Above Average', risk_level='low', interpretation='Excellent shoulder flexibility for your age group.', norm_low=norm_low, norm_high=norm_high)
    return BackScratchClassification(classification='Average', risk_level='moderate', interpretation='Within the typical range. Stretch regularly to maintain it.', norm_low=norm_low, norm_high=norm_high)

def _pick_band(age: int) -> _Band:
    if age < _AGE_BANDS[0].min_age:
        return _AGE_BANDS[0]
    if age > _AGE_BANDS[-1].max_age:
        return _AGE_BANDS[-1]
    for b in _AGE_BANDS:
        if b.min_age <= age <= b.max_age:
            return b
    return _AGE_BANDS[0]
