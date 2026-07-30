"""Validation-to-production compatibility checks for chair-stand replay."""

from __future__ import annotations

import math
import numbers
from dataclasses import dataclass
from typing import get_args

from validation.chair_stand.schema import (
    MAX_SUBJECT_HEIGHT_CM,
    MIN_SUBJECT_HEIGHT_CM,
    SubjectAnnotation,
)


@dataclass(frozen=True)
class ProductionSubjectInputs:
    age: int
    sex: str
    height_cm: float


@dataclass(frozen=True)
class ChairStandDurations:
    calibration_s: float
    countdown_s: float
    active_duration_s: float


def production_sex_values() -> frozenset[str]:
    """Read the accepted values lazily from the production ``Sex`` type."""
    from app.cv.types import Sex as ProductionSex

    values = get_args(ProductionSex)
    if not values or any(not isinstance(value, str) for value in values):
        raise RuntimeError("Production Sex must be a non-empty string Literal")
    return frozenset(values)


def map_subject_to_production(
    subject: SubjectAnnotation,
) -> ProductionSubjectInputs:
    """Fail closed on compatibility, then preserve the annotated values."""
    sex = subject.sex.value
    accepted_sexes = production_sex_values()
    if sex not in accepted_sexes:
        raise ValueError(
            f"Validation sex value {sex!r} is not accepted by production; "
            f"accepted values are {sorted(accepted_sexes)!r}"
        )
    _validate_height_for_production(subject.height_cm)
    return ProductionSubjectInputs(subject.age, sex, subject.height_cm)


def production_chair_stand_durations() -> ChairStandDurations:
    """Read the current duration profile from the production strategy."""
    from app.tests.chair_stand.strategy import ChairStandStrategy

    strategy = ChairStandStrategy()
    return ChairStandDurations(
        calibration_s=_validated_duration(
            strategy.calibration_s,
            "ChairStandStrategy.calibration_s",
        ),
        countdown_s=_validated_duration(
            strategy.countdown_s,
            "ChairStandStrategy.countdown_s",
            allow_zero=True,
        ),
        active_duration_s=_validated_duration(
            strategy.active_duration_s,
            "ChairStandStrategy.active_duration_s",
        ),
    )


def _validate_height_for_production(value: object) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, numbers.Real)
        or not math.isfinite(float(value))
        or not MIN_SUBJECT_HEIGHT_CM <= value <= MAX_SUBJECT_HEIGHT_CM
    ):
        raise ValueError(
            "subject.height_cm must be between "
            f"{MIN_SUBJECT_HEIGHT_CM:g} and {MAX_SUBJECT_HEIGHT_CM:g} "
            "centimetres inclusive before production strategy initialization"
        )


def _validated_duration(
    value: object,
    field: str,
    *,
    allow_zero: bool = False,
) -> float:
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        raise RuntimeError(f"{field} must be numeric")
    duration = float(value)
    minimum_met = duration >= 0.0 if allow_zero else duration > 0.0
    if not math.isfinite(duration) or not minimum_met:
        qualifier = "non-negative" if allow_zero else "greater than zero"
        raise RuntimeError(f"{field} must be finite and {qualifier}")
    return duration
