from dataclasses import dataclass
from app.cv.types import RiskLevel, Sex

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
    risk_level: RiskLevel
    interpretation: str
    norm_low: int
    norm_high: int

def classify_chair_stand(reps: int, age: int | None, sex: Sex) -> ChairStandClassification | None:
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
    if reps < low:
        return ChairStandClassification(classification='Below Average', risk_level='high', interpretation='Your score is below the typical range for your age. Consider speaking with a health coach about a lower-body strength programme.', norm_low=low, norm_high=high)
    if reps > high:
        return ChairStandClassification(classification='Above Average', risk_level='low', interpretation='Excellent lower-body strength for your age group.', norm_low=low, norm_high=high)
    return ChairStandClassification(classification='Average', risk_level='moderate', interpretation='Within the typical range for your age. Regular strength exercises will help maintain or improve it.', norm_low=low, norm_high=high)

def _pick_band(age: int) -> _Band:
    if age < _AGE_BANDS[0].min_age:
        return _AGE_BANDS[0]
    if age > _AGE_BANDS[-1].max_age:
        return _AGE_BANDS[-1]
    for b in _AGE_BANDS:
        if b.min_age <= age <= b.max_age:
            return b
    return _AGE_BANDS[0]
