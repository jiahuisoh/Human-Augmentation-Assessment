"""Pure contracts, validation, hashing, comparison, and serialisation.

Validity semantics are intentionally explicit:

* ``valid_movement`` is processable and its detected repetitions are compared
  with the annotated repetitions.
* ``invalid_movement`` is also processable, but the movement should not count;
  it passes when the detected repetitions equal the annotation, commonly zero.
* ``invalid_input`` is not a valid processable assessment. Completion is an
  unexpected acceptance even when the detector reports zero repetitions.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Mapping, TypeAlias, TypeVar


SCHEMA_VERSION = 1
MIN_SUBJECT_HEIGHT_CM = 100.0
MAX_SUBJECT_HEIGHT_CM = 200.0

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
CsvValue: TypeAlias = JsonScalar


class SourceType(str, Enum):
    REAL = "real"
    SYNTHDA = "synthda"


class ExpectedValidity(str, Enum):
    VALID_MOVEMENT = "valid_movement"
    INVALID_MOVEMENT = "invalid_movement"
    INVALID_INPUT = "invalid_input"


class Sex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class ProcessingStatus(str, Enum):
    COMPLETED = "completed"
    REJECTED = "rejected"


class FailureCategory(str, Enum):
    VIDEO_UNREADABLE = "video_unreadable"
    POSE_MISSING = "pose_missing"
    CALIBRATION_FAILED = "calibration_failed"
    CALIBRATION_QUALITY_LOW = "calibration_quality_low"
    INSUFFICIENT_TEST_SIGNAL = "insufficient_test_signal"
    LOW_POSE_COVERAGE = "low_pose_coverage"
    UNEXPECTED_ACCEPTANCE = "unexpected_acceptance"
    UNEXPECTED_REJECTION = "unexpected_rejection"
    REP_UNDER_COUNT = "rep_under_count"
    REP_OVER_COUNT = "rep_over_count"
    RUNTIME_ERROR = "runtime_error"


_RUNTIME_FAILURE_CATEGORIES = frozenset(
    {
        FailureCategory.VIDEO_UNREADABLE,
        FailureCategory.POSE_MISSING,
        FailureCategory.CALIBRATION_FAILED,
        FailureCategory.CALIBRATION_QUALITY_LOW,
        FailureCategory.INSUFFICIENT_TEST_SIGNAL,
        FailureCategory.LOW_POSE_COVERAGE,
        FailureCategory.RUNTIME_ERROR,
    }
)
_SHA256_PATTERN = re.compile(r"[0-9a-fA-F]{64}")
_WINDOWS_DRIVE_PATTERN = re.compile(r"^[A-Za-z]:")


class ManifestValidationError(ValueError):
    """Raised when a manifest field violates the versioned contract."""


@dataclass(frozen=True)
class SubjectAnnotation:
    """Subject values recorded at assessment time for production compatibility.

    ``age`` is the non-negative integer age at assessment or recording time,
    not a date of birth or an independent age-calculation authority. When a
    case is linked to a production user, authors should use the age produced by
    the production profile process; anonymous approved clips may use an
    authorised assessment-time annotation. ``height_cm`` is measured in
    centimetres.
    """

    age: int
    sex: Sex
    height_cm: float

    def __post_init__(self) -> None:
        _validate_non_negative_int(self.age, "subject.age")
        _validate_enum(self.sex, Sex, "subject.sex")
        validate_subject_height_cm(self.height_cm)

    def to_dict(self) -> dict[str, JsonValue]:
        return {"age": self.age, "sex": self.sex.value, "height_cm": self.height_cm}


@dataclass(frozen=True)
class TimingAnnotation:
    calibration_start_s: float
    calibration_end_s: float
    test_start_s: float
    test_end_s: float

    def __post_init__(self) -> None:
        values = (
            (self.calibration_start_s, "timing.calibration_start_s"),
            (self.calibration_end_s, "timing.calibration_end_s"),
            (self.test_start_s, "timing.test_start_s"),
            (self.test_end_s, "timing.test_end_s"),
        )
        for value, field in values:
            _validate_non_negative_finite_number(value, field)
        if not (
            self.calibration_start_s
            < self.calibration_end_s
            <= self.test_start_s
            < self.test_end_s
        ):
            raise ValueError(
                "timing must satisfy calibration_start_s < calibration_end_s "
                "<= test_start_s < test_end_s"
            )

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "calibration_start_s": self.calibration_start_s,
            "calibration_end_s": self.calibration_end_s,
            "test_start_s": self.test_start_s,
            "test_end_s": self.test_end_s,
        }


@dataclass(frozen=True)
class ViewMetadata:
    camera_angle: str
    distance: str
    lighting: str
    occlusion: str

    def __post_init__(self) -> None:
        _validate_non_empty_string(self.camera_angle, "view.camera_angle")
        _validate_non_empty_string(self.distance, "view.distance")
        _validate_non_empty_string(self.lighting, "view.lighting")
        _validate_non_empty_string(self.occlusion, "view.occlusion")

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "camera_angle": self.camera_angle,
            "distance": self.distance,
            "lighting": self.lighting,
            "occlusion": self.occlusion,
        }


@dataclass(frozen=True)
class GenerationProvenance:
    """Reproduction metadata only; it does not establish clinical validity."""

    tool: str
    version: str
    run_id: str
    seed: str
    config_sha256: str

    def __post_init__(self) -> None:
        _validate_identity_string(self.tool, "generation.tool")
        _validate_identity_string(self.version, "generation.version")
        _validate_identity_string(self.run_id, "generation.run_id")
        _validate_non_empty_string(self.seed, "generation.seed")
        object.__setattr__(
            self,
            "config_sha256",
            _validate_sha256(self.config_sha256, "generation.config_sha256"),
        )

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "tool": self.tool,
            "version": self.version,
            "run_id": self.run_id,
            "seed": self.seed,
            "config_sha256": self.config_sha256,
        }


@dataclass(frozen=True)
class ExpectedOutcome:
    """Offline expected outcome and regression acceptance criteria.

    ``minimum_calibration_quality`` is an offline comparison floor only. It is
    not a live production rejection threshold and is not supplied to the
    production strategy.
    """

    validity: ExpectedValidity
    repetitions: int
    minimum_calibration_quality: float = 0.5

    def __post_init__(self) -> None:
        _validate_enum(self.validity, ExpectedValidity, "expected.validity")
        _validate_non_negative_int(self.repetitions, "expected.repetitions")
        _validate_unit_interval(
            self.minimum_calibration_quality,
            "expected.minimum_calibration_quality",
        )

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "validity": self.validity.value,
            "repetitions": self.repetitions,
            "minimum_calibration_quality": self.minimum_calibration_quality,
        }


@dataclass(frozen=True)
class ValidationCase:
    case_id: str
    video_path: str
    video_sha256: str
    source_type: SourceType
    expected: ExpectedOutcome
    subject: SubjectAnnotation
    timing: TimingAnnotation
    view: ViewMetadata
    generation: GenerationProvenance | None = None
    notes: str = ""

    def __post_init__(self) -> None:
        _validate_identity_string(self.case_id, "case_id")
        _validate_portable_video_path(self.video_path, "video_path")
        object.__setattr__(
            self,
            "video_sha256",
            _validate_sha256(self.video_sha256, "video_sha256"),
        )
        _validate_enum(self.source_type, SourceType, "source_type")
        if not isinstance(self.expected, ExpectedOutcome):
            raise ValueError("expected must be an ExpectedOutcome")
        if not isinstance(self.subject, SubjectAnnotation):
            raise ValueError("subject must be a SubjectAnnotation")
        if not isinstance(self.timing, TimingAnnotation):
            raise ValueError("timing must be a TimingAnnotation")
        if not isinstance(self.view, ViewMetadata):
            raise ValueError("view must be ViewMetadata")
        if self.source_type is SourceType.SYNTHDA and self.generation is None:
            raise ValueError("generation is required when source_type is 'synthda'")
        if self.source_type is SourceType.REAL and self.generation is not None:
            raise ValueError("generation must be omitted when source_type is 'real'")
        if self.generation is not None and not isinstance(self.generation, GenerationProvenance):
            raise ValueError("generation must be GenerationProvenance or None")
        if not isinstance(self.notes, str):
            raise ValueError("notes must be a string")

    def resolve_video_path(self, manifest_path: Path) -> Path:
        """Resolve the stored POSIX-style relative path beside a manifest.

        The returned path is machine-specific. ``video_path`` remains unchanged,
        and canonical hashing always uses that stored portable string.
        """
        manifest = Path(manifest_path)
        relative = PurePosixPath(self.video_path)
        return manifest.parent.joinpath(*relative.parts).resolve(strict=False)

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "case_id": self.case_id,
            "video_path": self.video_path,
            "video_sha256": self.video_sha256,
            "source_type": self.source_type.value,
            "expected": self.expected.to_dict(),
            "subject": self.subject.to_dict(),
            "timing": self.timing.to_dict(),
            "view": self.view.to_dict(),
            "generation": self.generation.to_dict() if self.generation else None,
            "notes": self.notes,
        }

    def to_csv_row(self) -> dict[str, CsvValue]:
        generation = self.generation
        return {
            "case_id": self.case_id,
            "video_path": self.video_path,
            "video_sha256": self.video_sha256,
            "source_type": self.source_type.value,
            "expected_validity": self.expected.validity.value,
            "expected_repetitions": self.expected.repetitions,
            "minimum_calibration_quality": self.expected.minimum_calibration_quality,
            "subject_age": self.subject.age,
            "subject_sex": self.subject.sex.value,
            "subject_height_cm": self.subject.height_cm,
            "calibration_start_s": self.timing.calibration_start_s,
            "calibration_end_s": self.timing.calibration_end_s,
            "test_start_s": self.timing.test_start_s,
            "test_end_s": self.timing.test_end_s,
            "camera_angle": self.view.camera_angle,
            "distance": self.view.distance,
            "lighting": self.view.lighting,
            "occlusion": self.view.occlusion,
            "generation_tool": generation.tool if generation else None,
            "generation_version": generation.version if generation else None,
            "generation_run_id": generation.run_id if generation else None,
            "generation_seed": generation.seed if generation else None,
            "generation_config_sha256": generation.config_sha256 if generation else None,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class ValidationManifest:
    schema_version: int
    dataset_id: str
    cases: tuple[ValidationCase, ...]

    def __post_init__(self) -> None:
        if type(self.schema_version) is not int:
            raise ValueError("manifest.schema_version must be an integer")
        if self.schema_version != SCHEMA_VERSION:
            raise ValueError(
                f"manifest.schema_version has unsupported value {self.schema_version}; "
                f"expected {SCHEMA_VERSION}"
            )
        _validate_identity_string(self.dataset_id, "manifest.dataset_id")
        cases = tuple(self.cases)
        if not cases:
            raise ValueError("manifest.cases must contain at least one case")
        if any(not isinstance(case, ValidationCase) for case in cases):
            raise ValueError("manifest.cases must contain only ValidationCase values")
        seen: set[str] = set()
        for case in cases:
            if case.case_id in seen:
                raise ValueError(f"case '{case.case_id}'.case_id is duplicated")
            seen.add(case.case_id)
        object.__setattr__(self, "cases", cases)

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "schema_version": self.schema_version,
            "dataset_id": self.dataset_id,
            "cases": [case.to_dict() for case in self.cases],
        }


@dataclass(frozen=True)
class DetectedOutcome:
    status: ProcessingStatus
    repetitions: int | None = None
    calibration_quality: float | None = None
    failure_category: FailureCategory | None = None

    def __post_init__(self) -> None:
        _validate_enum(self.status, ProcessingStatus, "detected.status")
        if self.repetitions is not None:
            _validate_non_negative_int(self.repetitions, "detected.repetitions")
        if self.calibration_quality is not None:
            _validate_unit_interval(self.calibration_quality, "detected.calibration_quality")
        if self.status is ProcessingStatus.COMPLETED:
            if self.repetitions is None:
                raise ValueError("detected.repetitions is required when status is completed")
            if self.calibration_quality is None:
                raise ValueError("detected.calibration_quality is required when status is completed")
            if self.failure_category is not None:
                raise ValueError("detected.failure_category must be empty when status is completed")
        elif self.failure_category not in _RUNTIME_FAILURE_CATEGORIES | {None}:
            raise ValueError("detected.failure_category must describe a runtime-processing failure")

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "processing_status": self.status.value,
            "detected_repetitions": self.repetitions,
            "calibration_quality": self.calibration_quality,
            "runtime_failure_category": (
                self.failure_category.value if self.failure_category else None
            ),
        }


@dataclass(frozen=True)
class ComparisonResult:
    rep_error: int | None
    absolute_rep_error: int | None
    passed: bool
    failure_category: FailureCategory | None

    def __post_init__(self) -> None:
        if self.rep_error is not None and type(self.rep_error) is not int:
            raise ValueError("rep_error must be an integer or None")
        if self.absolute_rep_error is not None and (
            type(self.absolute_rep_error) is not int or self.absolute_rep_error < 0
        ):
            raise ValueError("absolute_rep_error must be a non-negative integer or None")
        if (self.rep_error is None) != (self.absolute_rep_error is None):
            raise ValueError("rep_error and absolute_rep_error must both be present or absent")
        if self.rep_error is not None and self.absolute_rep_error != abs(self.rep_error):
            raise ValueError("absolute_rep_error must equal abs(rep_error)")
        if type(self.passed) is not bool:
            raise ValueError("passed must be a boolean")
        if self.failure_category is not None:
            _validate_enum(
                self.failure_category,
                FailureCategory,
                "failure_category",
            )
        if self.passed and self.failure_category is not None:
            raise ValueError("failure_category must be empty when passed is true")
        if not self.passed and self.failure_category is None:
            raise ValueError("failure_category is required when passed is false")

    def to_dict(self) -> dict[str, JsonValue]:
        return {
            "rep_error": self.rep_error,
            "absolute_rep_error": self.absolute_rep_error,
            "passed": self.passed,
            "failure_category": self.failure_category.value if self.failure_category else None,
        }


@dataclass(frozen=True)
class CaseResult:
    """Generic per-case report data shared by JSON and CSV output."""

    case_id: str
    expected: ExpectedOutcome
    detected: DetectedOutcome
    comparison: ComparisonResult

    def __post_init__(self) -> None:
        _validate_identity_string(self.case_id, "case_result.case_id")
        if not isinstance(self.expected, ExpectedOutcome):
            raise ValueError("case_result.expected must be an ExpectedOutcome")
        if not isinstance(self.detected, DetectedOutcome):
            raise ValueError("case_result.detected must be a DetectedOutcome")
        if not isinstance(self.comparison, ComparisonResult):
            raise ValueError("case_result.comparison must be a ComparisonResult")
        calculated = compare_outcomes(self.expected, self.detected)
        if self.comparison != calculated:
            raise ValueError("case_result.comparison does not match expected and detected outcomes")

    @classmethod
    def from_outcomes(
        cls,
        case_id: str,
        expected: ExpectedOutcome,
        detected: DetectedOutcome,
    ) -> CaseResult:
        return cls(case_id, expected, detected, compare_outcomes(expected, detected))

    def to_dict(self) -> dict[str, JsonValue]:
        """Return the single flat contract also used by CSV serialisation."""
        return {
            "case_id": self.case_id,
            "processing_status": self.detected.status.value,
            "expected_validity": self.expected.validity.value,
            "expected_repetitions": self.expected.repetitions,
            "detected_repetitions": self.detected.repetitions,
            "rep_error": self.comparison.rep_error,
            "absolute_rep_error": self.comparison.absolute_rep_error,
            "passed": self.comparison.passed,
            "failure_category": (
                self.comparison.failure_category.value
                if self.comparison.failure_category
                else None
            ),
            "runtime_failure_category": (
                self.detected.failure_category.value
                if self.detected.failure_category
                else None
            ),
            "calibration_quality": self.detected.calibration_quality,
        }

    def to_csv_row(self) -> dict[str, CsvValue]:
        return dict(self.to_dict())


def load_manifest(manifest_path: Path) -> ValidationManifest:
    """Load and validate a chair-stand manifest from JSON."""
    path = Path(manifest_path)
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Manifest file not found: {path}") from exc
    except OSError as exc:
        raise OSError(f"Could not read manifest file {path}: {exc}") from exc

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ManifestValidationError(
            f"manifest JSON is invalid at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    return manifest_from_payload(payload)


def manifest_from_payload(payload: object) -> ValidationManifest:
    """Validate a decoded JSON payload and return typed manifest data."""
    root = _as_mapping(payload, "manifest")
    schema_version = _as_int(
        _required(root, "schema_version", "manifest"),
        "manifest.schema_version",
    )
    if schema_version != SCHEMA_VERSION:
        raise ManifestValidationError(
            f"manifest.schema_version: unsupported value {schema_version}; expected {SCHEMA_VERSION}"
        )
    dataset_id = _as_non_empty_string(
        _required(root, "dataset_id", "manifest"),
        "manifest.dataset_id",
    )
    raw_cases = _required(root, "cases", "manifest")
    if not isinstance(raw_cases, list):
        raise ManifestValidationError("manifest.cases must be an array")
    cases = tuple(_parse_case(raw_case, index) for index, raw_case in enumerate(raw_cases))
    try:
        return ValidationManifest(schema_version, dataset_id, cases)
    except ValueError as exc:
        raise ManifestValidationError(str(exc)) from exc


def compare_outcomes(expected: ExpectedOutcome, detected: DetectedOutcome) -> ComparisonResult:
    """Apply the validity decision table to expected and detected outcomes."""
    rep_error = (
        detected.repetitions - expected.repetitions
        if detected.repetitions is not None
        else None
    )
    absolute_rep_error = abs(rep_error) if rep_error is not None else None

    if detected.failure_category is FailureCategory.RUNTIME_ERROR:
        return ComparisonResult(None, None, False, FailureCategory.RUNTIME_ERROR)

    if expected.validity is ExpectedValidity.INVALID_INPUT:
        if detected.status is ProcessingStatus.COMPLETED:
            return ComparisonResult(
                rep_error,
                absolute_rep_error,
                False,
                FailureCategory.UNEXPECTED_ACCEPTANCE,
            )
        return ComparisonResult(None, None, True, None)

    if detected.status is ProcessingStatus.REJECTED:
        return ComparisonResult(
            rep_error,
            absolute_rep_error,
            False,
            detected.failure_category or FailureCategory.UNEXPECTED_REJECTION,
        )

    if detected.calibration_quality < expected.minimum_calibration_quality:
        return ComparisonResult(
            rep_error,
            absolute_rep_error,
            False,
            FailureCategory.CALIBRATION_QUALITY_LOW,
        )
    if rep_error < 0:
        return ComparisonResult(
            rep_error,
            absolute_rep_error,
            False,
            FailureCategory.REP_UNDER_COUNT,
        )
    if rep_error > 0:
        return ComparisonResult(
            rep_error,
            absolute_rep_error,
            False,
            FailureCategory.REP_OVER_COUNT,
        )
    return ComparisonResult(rep_error, absolute_rep_error, True, None)


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Return the SHA-256 digest of a file without loading it all into memory."""
    file_path = Path(path)
    if type(chunk_size) is not int or chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    if not file_path.is_file():
        raise FileNotFoundError(
            f"Cannot hash file because it does not exist or is not a file: {file_path}"
        )
    digest = hashlib.sha256()
    with file_path.open("rb") as file:
        for chunk in iter(lambda: file.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(payload: JsonValue) -> str:
    """Hash JSON data with stable Unicode encoding and canonical key ordering."""
    try:
        canonical = json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"payload must be finite JSON-compatible data: {exc}") from exc
    return hashlib.sha256(canonical).hexdigest()


def _parse_case(payload: object, index: int) -> ValidationCase:
    indexed_path = f"manifest.cases[{index}]"
    raw = _as_mapping(payload, indexed_path)
    case_id = _as_non_empty_string(
        _required(raw, "case_id", indexed_path),
        f"{indexed_path}.case_id",
    )
    case_path = f"case '{case_id}'"
    source_type = _as_enum(
        SourceType,
        _required(raw, "source_type", case_path),
        f"{case_path}.source_type",
    )
    raw_generation = raw.get("generation")
    generation = (
        _parse_generation(raw_generation, case_path)
        if raw_generation is not None
        else None
    )
    return _construct_with_context(
        case_path,
        lambda: ValidationCase(
            case_id=case_id,
            video_path=_as_non_empty_string(
                _required(raw, "video_path", case_path),
                f"{case_path}.video_path",
            ),
            video_sha256=_as_non_empty_string(
                _required(raw, "video_sha256", case_path),
                f"{case_path}.video_sha256",
            ),
            source_type=source_type,
            expected=_parse_expected(_required(raw, "expected", case_path), case_path),
            subject=_parse_subject(_required(raw, "subject", case_path), case_path),
            timing=_parse_timing(_required(raw, "timing", case_path), case_path),
            view=_parse_view(_required(raw, "view", case_path), case_path),
            generation=generation,
            notes=_as_string(raw.get("notes", ""), f"{case_path}.notes"),
        ),
    )


def _parse_expected(payload: object, case_path: str) -> ExpectedOutcome:
    field_path = f"{case_path}.expected"
    raw = _as_mapping(payload, field_path)
    return _construct_with_context(
        case_path,
        lambda: ExpectedOutcome(
            validity=_as_enum(
                ExpectedValidity,
                _required(raw, "validity", field_path),
                f"{field_path}.validity",
            ),
            repetitions=_as_int(
                _required(raw, "repetitions", field_path),
                f"{field_path}.repetitions",
            ),
            minimum_calibration_quality=_as_number(
                raw.get("minimum_calibration_quality", 0.5),
                f"{field_path}.minimum_calibration_quality",
            ),
        ),
    )


def _parse_subject(payload: object, case_path: str) -> SubjectAnnotation:
    field_path = f"{case_path}.subject"
    raw = _as_mapping(payload, field_path)
    return _construct_with_context(
        case_path,
        lambda: SubjectAnnotation(
            age=_as_int(_required(raw, "age", field_path), f"{field_path}.age"),
            sex=_as_enum(Sex, _required(raw, "sex", field_path), f"{field_path}.sex"),
            height_cm=_as_number(
                _required(raw, "height_cm", field_path),
                f"{field_path}.height_cm",
            ),
        ),
    )


def _parse_timing(payload: object, case_path: str) -> TimingAnnotation:
    field_path = f"{case_path}.timing"
    raw = _as_mapping(payload, field_path)
    return _construct_with_context(
        case_path,
        lambda: TimingAnnotation(
            calibration_start_s=_as_number(
                _required(raw, "calibration_start_s", field_path),
                f"{field_path}.calibration_start_s",
            ),
            calibration_end_s=_as_number(
                _required(raw, "calibration_end_s", field_path),
                f"{field_path}.calibration_end_s",
            ),
            test_start_s=_as_number(
                _required(raw, "test_start_s", field_path),
                f"{field_path}.test_start_s",
            ),
            test_end_s=_as_number(
                _required(raw, "test_end_s", field_path),
                f"{field_path}.test_end_s",
            ),
        ),
    )


def _parse_view(payload: object, case_path: str) -> ViewMetadata:
    field_path = f"{case_path}.view"
    raw = _as_mapping(payload, field_path)
    return _construct_with_context(
        case_path,
        lambda: ViewMetadata(
            camera_angle=_as_non_empty_string(
                _required(raw, "camera_angle", field_path),
                f"{field_path}.camera_angle",
            ),
            distance=_as_non_empty_string(
                _required(raw, "distance", field_path),
                f"{field_path}.distance",
            ),
            lighting=_as_non_empty_string(
                _required(raw, "lighting", field_path),
                f"{field_path}.lighting",
            ),
            occlusion=_as_non_empty_string(
                _required(raw, "occlusion", field_path),
                f"{field_path}.occlusion",
            ),
        ),
    )


def _parse_generation(payload: object, case_path: str) -> GenerationProvenance:
    field_path = f"{case_path}.generation"
    raw = _as_mapping(payload, field_path)
    seed_value = _required(raw, "seed", field_path)
    if isinstance(seed_value, bool) or not isinstance(seed_value, (str, int)):
        raise ManifestValidationError(f"{field_path}.seed must be a string or integer")
    return _construct_with_context(
        case_path,
        lambda: GenerationProvenance(
            tool=_as_non_empty_string(
                _required(raw, "tool", field_path),
                f"{field_path}.tool",
            ),
            version=_as_non_empty_string(
                _required(raw, "version", field_path),
                f"{field_path}.version",
            ),
            run_id=_as_non_empty_string(
                _required(raw, "run_id", field_path),
                f"{field_path}.run_id",
            ),
            seed=str(seed_value),
            config_sha256=_as_non_empty_string(
                _required(raw, "config_sha256", field_path),
                f"{field_path}.config_sha256",
            ),
        ),
    )


EnumType = TypeVar("EnumType", bound=Enum)
ConstructedType = TypeVar("ConstructedType")


def _construct_with_context(
    case_path: str,
    factory: Callable[[], ConstructedType],
) -> ConstructedType:
    try:
        return factory()
    except ManifestValidationError:
        raise
    except ValueError as exc:
        message = str(exc)
        if message.startswith(case_path):
            raise ManifestValidationError(message) from exc
        raise ManifestValidationError(f"{case_path}.{message}") from exc


def _required(mapping: Mapping[str, Any], name: str, field_path: str) -> Any:
    if name not in mapping:
        raise ManifestValidationError(f"{field_path}.{name} is required")
    return mapping[name]


def _as_mapping(value: object, field_path: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise ManifestValidationError(f"{field_path} must be an object")
    return value


def _as_string(value: object, field_path: str) -> str:
    if not isinstance(value, str):
        raise ManifestValidationError(f"{field_path} must be a string")
    return value


def _as_non_empty_string(value: object, field_path: str) -> str:
    result = _as_string(value, field_path)
    if not result.strip():
        raise ManifestValidationError(f"{field_path} must not be empty")
    return result


def _as_int(value: object, field_path: str) -> int:
    if type(value) is not int:
        raise ManifestValidationError(f"{field_path} must be an integer")
    return value


def _as_number(value: object, field_path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ManifestValidationError(f"{field_path} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ManifestValidationError(f"{field_path} must be finite")
    return result


def _as_enum(enum_type: type[EnumType], value: object, field_path: str) -> EnumType:
    if not isinstance(value, str):
        raise ManifestValidationError(f"{field_path} must be a string")
    try:
        return enum_type(value)
    except ValueError as exc:
        allowed = ", ".join(repr(member.value) for member in enum_type)
        raise ManifestValidationError(
            f"{field_path}: invalid value {value!r}; expected one of {allowed}"
        ) from exc


def _validate_enum(value: object, enum_type: type[Enum], field_path: str) -> None:
    if not isinstance(value, enum_type):
        raise ValueError(f"{field_path} must be {enum_type.__name__}")


def _validate_non_empty_string(value: object, field_path: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_path} must be a non-empty string")


def _validate_identity_string(value: object, field_path: str) -> None:
    _validate_non_empty_string(value, field_path)
    if value != value.strip():
        raise ValueError(
            f"{field_path} must not contain leading or trailing whitespace"
        )


def _validate_non_negative_int(value: object, field_path: str) -> None:
    if type(value) is not int or value < 0:
        raise ValueError(f"{field_path} must be a non-negative integer")


def _validate_non_negative_finite_number(value: object, field_path: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_path} must be a number")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{field_path} must be finite and non-negative")


def _validate_positive_finite_number(value: object, field_path: str) -> None:
    _validate_non_negative_finite_number(value, field_path)
    if value <= 0:
        raise ValueError(f"{field_path} must be greater than zero")


def validate_subject_height_cm(value: object) -> None:
    """Validate the offline centimetre range used at production handoff."""
    _validate_positive_finite_number(value, "subject.height_cm")
    if not MIN_SUBJECT_HEIGHT_CM <= value <= MAX_SUBJECT_HEIGHT_CM:
        raise ValueError(
            "subject.height_cm must be between "
            f"{MIN_SUBJECT_HEIGHT_CM:g} and {MAX_SUBJECT_HEIGHT_CM:g} "
            "centimetres inclusive"
        )


def _validate_unit_interval(value: object, field_path: str) -> None:
    _validate_non_negative_finite_number(value, field_path)
    if value > 1:
        raise ValueError(f"{field_path} must be between 0 and 1")


def _validate_sha256(value: object, field_path: str) -> str:
    if not isinstance(value, str) or _SHA256_PATTERN.fullmatch(value) is None:
        raise ValueError(f"{field_path} must be a 64-character hexadecimal SHA-256")
    return value.lower()


def _validate_portable_video_path(value: object, field_path: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_path} must be a non-empty portable path string")
    if value != value.strip():
        raise ValueError(f"{field_path} must not contain leading or trailing whitespace")
    if "\x00" in value:
        raise ValueError(f"{field_path} must not contain a NUL byte")
    if "\\" in value:
        raise ValueError(f"{field_path} must use forward slashes")
    if "://" in value:
        raise ValueError(f"{field_path} must be a path, not a URI")
    if _WINDOWS_DRIVE_PATTERN.match(value) or PurePosixPath(value).is_absolute():
        raise ValueError(f"{field_path} must be relative to the manifest directory")
    if PurePosixPath(value) in {PurePosixPath("."), PurePosixPath("..")}:
        raise ValueError(f"{field_path} must identify a video file")
