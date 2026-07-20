"""Generate pending chair-stand annotation records from authoritative JSON.

This module deliberately handles metadata only.  It neither opens video files nor
imports any production computer-vision code.  The standard-library path and file
identity checks below reduce, but cannot absolutely eliminate, every filesystem
race available to a privileged concurrent process.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import re
import shutil
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


ANNOTATION_SCHEMA_VERSION = 1
ANNOTATION_RECORD_VERSION = 1
SOURCE_SCHEMA_VERSION = 1
VALIDITY_VALUES = frozenset(
    {"valid_movement", "invalid_movement", "invalid_input"}
)
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
IDENTITY_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
REVISION_ONE_PATTERN = re.compile(
    r"(?:^|[-_.])(?:v1|rev(?:ision)?[-_]?1)(?:[-_.]|$)", re.IGNORECASE
)
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FILE_ATTRIBUTE_REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
MAX_SAFE_JSON_INTEGER = (1 << 53) - 1
MAX_SAFE_JSON_NUMBER = float(MAX_SAFE_JSON_INTEGER)


class AnnotationDataError(ValueError):
    """Raised when source data violates the annotation-pack contract."""


@dataclass(frozen=True)
class _UnrepresentableJsonInteger:
    literal: str


@dataclass(frozen=True)
class SourceDocument:
    path: Path
    filename: str
    sha256: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class SourceBundle:
    inventory: SourceDocument
    provenance: SourceDocument
    case_specification: SourceDocument
    inventory_cases: Mapping[str, dict[str, Any]]
    specification_cases: tuple[dict[str, Any], ...]


def _object_without_duplicate_keys(
    pairs: list[tuple[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise AnnotationDataError(f"JSON object contains duplicate key {key!r}")
        result[key] = value
    return result


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _absolute_path(path: Path) -> Path:
    """Return a lexical absolute path without resolving links or reparse points."""
    return Path(os.path.abspath(os.fspath(path)))


def _path_lstat(path: Path) -> os.stat_result:
    """Indirection kept small so Windows reparse enforcement is testable."""
    return path.lstat()


def _stat_is_reparse_point(result: os.stat_result) -> bool:
    attributes = getattr(result, "st_file_attributes", 0)
    return bool(attributes & FILE_ATTRIBUTE_REPARSE_POINT)


def _path_components(path: Path) -> tuple[Path, ...]:
    absolute = _absolute_path(path)
    return tuple(reversed(absolute.parents)) + (absolute,)


def _reject_symlink_components(path: Path, field: str) -> None:
    """Reject every existing symlink, junction, or reparse-point component."""
    for component in _path_components(path):
        try:
            result = _path_lstat(component)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(result.st_mode) or _stat_is_reparse_point(result):
            raise AnnotationDataError(
                f"{field} must not traverse a symbolic link, junction, or reparse point"
            )


def _stat_signature(result: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        result.st_dev,
        result.st_ino,
        result.st_size,
        result.st_mtime_ns,
        result.st_ctime_ns,
    )


def _read_regular_file_bytes(path: Path, label: str) -> tuple[Path, bytes]:
    """Read one regular file through one verified handle into an immutable buffer."""
    source = _absolute_path(path)
    _reject_symlink_components(source, label)
    try:
        path_before = _path_lstat(source)
    except FileNotFoundError as exc:
        raise AnnotationDataError(f"{label} must be an existing regular file") from exc
    if not stat.S_ISREG(path_before.st_mode) or _stat_is_reparse_point(path_before):
        raise AnnotationDataError(
            f"{label} must be a regular file, not a symbolic link or reparse point"
        )

    with source.open("rb") as stream:
        handle_before = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(handle_before.st_mode)
            or _stat_is_reparse_point(handle_before)
            or not os.path.samestat(path_before, handle_before)
        ):
            raise AnnotationDataError(f"{label} changed while it was being opened")
        raw = stream.read()
        handle_after = os.fstat(stream.fileno())
    if _stat_signature(handle_before) != _stat_signature(handle_after):
        raise AnnotationDataError(f"{label} changed while it was being read")

    _reject_symlink_components(source, label)
    try:
        path_after = _path_lstat(source)
    except FileNotFoundError as exc:
        raise AnnotationDataError(f"{label} changed while it was being read") from exc
    if (
        _stat_is_reparse_point(path_after)
        or not stat.S_ISREG(path_after.st_mode)
        or not os.path.samestat(handle_after, path_after)
        or _stat_signature(handle_after) != _stat_signature(path_after)
    ):
        raise AnnotationDataError(f"{label} changed while it was being read")
    return source, raw


def sha256_file(path: Path) -> str:
    """Hash the exact immutable bytes read from one verified regular-file handle."""
    _, raw = _read_regular_file_bytes(path, "source")
    return sha256_bytes(raw)


def reject_non_finite_numbers(value: Any, field: str) -> None:
    """Reject unsafe JSON numbers recursively while preserving their logical path."""
    if isinstance(value, _UnrepresentableJsonInteger):
        raise AnnotationDataError(
            f"{field} is outside the supported JSON integer range"
        )
    if isinstance(value, bool):
        return
    if isinstance(value, int) and abs(value) > MAX_SAFE_JSON_INTEGER:
        raise AnnotationDataError(
            f"{field} is outside the supported JSON integer range"
        )
    if isinstance(value, float):
        if not math.isfinite(value):
            raise AnnotationDataError(f"{field} contains a non-finite numeric value")
        if abs(value) > MAX_SAFE_JSON_NUMBER:
            raise AnnotationDataError(
                f"{field} is outside the supported finite numeric range"
            )
    if isinstance(value, Mapping):
        for key, child in value.items():
            reject_non_finite_numbers(child, f"{field}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            reject_non_finite_numbers(child, f"{field}[{index}]")


def _read_json_source(path: Path, label: str) -> SourceDocument:
    source, raw = _read_regular_file_bytes(path, label)
    if raw.startswith(b"\xef\xbb\xbf"):
        raise AnnotationDataError(f"{label} must use UTF-8 without a BOM")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise AnnotationDataError(f"{label} is not valid UTF-8: {exc}") from exc
    try:
        payload = json.loads(
            text,
            object_pairs_hook=_object_without_duplicate_keys,
            parse_int=_parse_json_integer,
        )
    except AnnotationDataError:
        raise
    except json.JSONDecodeError as exc:
        raise AnnotationDataError(
            f"{label} is invalid JSON at line {exc.lineno}, column {exc.colno}: "
            f"{exc.msg}"
        ) from exc
    except (OverflowError, ValueError) as exc:
        raise AnnotationDataError(
            f"{label} contains an unrepresentable JSON numeric value"
        ) from exc
    reject_non_finite_numbers(payload, label)
    if not isinstance(payload, dict):
        raise AnnotationDataError(f"{label} root must be a JSON object")
    return SourceDocument(
        path=source,
        filename=source.name,
        sha256=sha256_bytes(raw),
        payload=payload,
    )


def _parse_json_integer(literal: str) -> int | _UnrepresentableJsonInteger:
    try:
        return int(literal)
    except (OverflowError, ValueError):
        return _UnrepresentableJsonInteger(literal)


def _require_object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AnnotationDataError(f"{field} must be an object")
    return value


def _require_list(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise AnnotationDataError(f"{field} must be an array")
    return value


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise AnnotationDataError(f"{field} must be a non-empty string without padding")
    if any(ord(character) < 32 for character in value):
        raise AnnotationDataError(f"{field} must not contain control characters")
    return value


def _require_identity(value: Any, field: str) -> str:
    identity = _require_string(value, field)
    if not IDENTITY_PATTERN.fullmatch(identity) or identity in {".", ".."}:
        raise AnnotationDataError(
            f"{field} must contain only portable identifier characters"
        )
    return identity


def _require_filename(value: Any, field: str) -> str:
    filename = _require_string(value, field)
    if (
        filename in {".", ".."}
        or "/" in filename
        or "\\" in filename
        or ":" in filename
        or Path(filename).name != filename
    ):
        raise AnnotationDataError(f"{field} must be a plain filename")
    return filename


def _require_sha256(value: Any, field: str) -> str:
    if not isinstance(value, str) or SHA256_PATTERN.fullmatch(value) is None:
        raise AnnotationDataError(
            f"{field} must be exactly 64 lowercase hexadecimal characters"
        )
    return value


def _require_version(payload: Mapping[str, Any], label: str) -> None:
    version = payload.get("schema_version")
    if type(version) is not int or version != SOURCE_SCHEMA_VERSION:
        raise AnnotationDataError(
            f"{label}.schema_version must equal {SOURCE_SCHEMA_VERSION}"
        )


def _require_finite_number(
    value: Any, field: str, *, minimum: float | None = 0.0
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AnnotationDataError(f"{field} must be a finite number")
    if isinstance(value, int) and abs(value) > MAX_SAFE_JSON_INTEGER:
        raise AnnotationDataError(
            f"{field} is outside the supported JSON integer range"
        )
    try:
        numeric = float(value)
    except (OverflowError, ValueError) as exc:
        raise AnnotationDataError(
            f"{field} must be a representable finite number"
        ) from exc
    if not math.isfinite(numeric) or abs(numeric) > MAX_SAFE_JSON_NUMBER:
        raise AnnotationDataError(
            f"{field} is outside the supported finite numeric range"
        )
    if minimum is not None and numeric < minimum:
        raise AnnotationDataError(
            f"{field} must be finite and greater than or equal to {minimum:g}"
        )
    return numeric


def _require_positive_number(value: Any, field: str) -> float:
    numeric = _require_finite_number(value, field)
    if numeric <= 0:
        raise AnnotationDataError(f"{field} must be greater than zero")
    return numeric


def _require_positive_integer(value: Any, field: str) -> int:
    if type(value) is not int or value <= 0:
        raise AnnotationDataError(f"{field} must be a positive integer")
    if value > MAX_SAFE_JSON_INTEGER:
        raise AnnotationDataError(
            f"{field} is outside the supported JSON integer range"
        )
    return value


def _require_non_negative_integer(value: Any, field: str) -> int:
    if type(value) is not int or value < 0:
        raise AnnotationDataError(f"{field} must be a non-negative integer")
    if value > MAX_SAFE_JSON_INTEGER:
        raise AnnotationDataError(
            f"{field} is outside the supported JSON integer range"
        )
    return value


def _metadata_value(
    metadata: Mapping[str, Any], aliases: Sequence[str], field: str
) -> Any:
    present = [name for name in aliases if name in metadata]
    if len(present) != 1:
        joined = " or ".join(aliases)
        raise AnnotationDataError(f"{field} must provide exactly one of {joined}")
    return metadata[present[0]]


def _timing_values(timing: Mapping[str, Any], field: str) -> tuple[float, float, float, float]:
    calibration_start = _require_finite_number(
        timing.get("calibration_start_s"), f"{field}.calibration_start_s"
    )
    calibration_end = _require_finite_number(
        timing.get("calibration_end_s"), f"{field}.calibration_end_s"
    )
    if "active_start_s" in timing or "active_end_s" in timing:
        if "test_start_s" in timing or "test_end_s" in timing:
            raise AnnotationDataError(
                f"{field} must not mix active_* and test_* timing names"
            )
        active_start = _require_finite_number(
            timing.get("active_start_s"), f"{field}.active_start_s"
        )
        active_end = _require_finite_number(
            timing.get("active_end_s"), f"{field}.active_end_s"
        )
    else:
        active_start = _require_finite_number(
            timing.get("test_start_s"), f"{field}.test_start_s"
        )
        active_end = _require_finite_number(
            timing.get("test_end_s"), f"{field}.test_end_s"
        )
    if not calibration_start < calibration_end <= active_start < active_end:
        raise AnnotationDataError(
            f"{field} must satisfy calibration_start < calibration_end "
            "<= active_start < active_end"
        )
    return calibration_start, calibration_end, active_start, active_end


def timing_values(timing: Mapping[str, Any]) -> tuple[float, float, float, float]:
    """Return normalized timing values for validator use without changing JSON."""
    return _timing_values(timing, "planned_timing")


def _frame_values(
    boundaries: Mapping[str, Any], field: str
) -> tuple[int, int, int, int]:
    names = ["calibration_start_frame", "calibration_end_frame"]
    if "active_start_frame" in boundaries or "active_end_frame" in boundaries:
        if "test_start_frame" in boundaries or "test_end_frame" in boundaries:
            raise AnnotationDataError(
                f"{field} must not mix active_* and test_* frame names"
            )
        names.extend(("active_start_frame", "active_end_frame"))
    else:
        names.extend(("test_start_frame", "test_end_frame"))
    result = tuple(
        _require_non_negative_integer(boundaries.get(name), f"{field}.{name}")
        for name in names
    )
    if not result[0] <= result[1] < result[2] <= result[3]:
        raise AnnotationDataError(f"{field} values are not ordered windows")
    return result  # type: ignore[return-value]


def _derived_frame_values(
    timing: tuple[float, float, float, float],
    fps: float,
    field: str,
    names: tuple[str, str, str, str],
) -> tuple[int, int, int, int]:
    tolerance = 1e-9
    rounders = (math.ceil, math.floor, math.ceil, math.floor)
    adjustments = (-tolerance, tolerance, -tolerance, tolerance)
    result: list[int] = []
    for seconds, name, rounder, adjustment in zip(
        timing, names, rounders, adjustments
    ):
        path = f"{field}.{name}"
        try:
            derived = seconds * fps
        except OverflowError as exc:
            raise AnnotationDataError(
                f"{path} overflows during frame derivation"
            ) from exc
        if not math.isfinite(derived) or abs(derived) > MAX_SAFE_JSON_INTEGER:
            raise AnnotationDataError(
                f"{path} is unrepresentable after frame derivation"
            )
        try:
            frame = rounder(derived + adjustment)
        except (OverflowError, ValueError) as exc:
            raise AnnotationDataError(
                f"{path} overflows during frame rounding"
            ) from exc
        if frame < 0 or frame > MAX_SAFE_JSON_INTEGER:
            raise AnnotationDataError(
                f"{path} is outside the supported frame range"
            )
        result.append(frame)
    return tuple(result)  # type: ignore[return-value]


def _validate_reference(
    payload: Mapping[str, Any],
    prefix: str,
    document: SourceDocument,
    label: str,
) -> None:
    filename = _require_filename(payload.get(f"{prefix}_filename"), f"{label}.{prefix}_filename")
    digest = _require_sha256(payload.get(f"{prefix}_sha256"), f"{label}.{prefix}_sha256")
    if filename != document.filename:
        raise AnnotationDataError(
            f"{label}.{prefix}_filename does not name the supplied {prefix} file"
        )
    if digest != document.sha256:
        raise AnnotationDataError(
            f"{label}.{prefix}_sha256 does not match the supplied {prefix} file"
        )


def _case_map(
    cases_value: Any, label: str, *, require_inventory_fields: bool
) -> tuple[dict[str, dict[str, Any]], tuple[dict[str, Any], ...]]:
    cases = _require_list(cases_value, f"{label}.cases")
    if not cases:
        raise AnnotationDataError(f"{label}.cases must not be empty")
    result: dict[str, dict[str, Any]] = {}
    ordered: list[dict[str, Any]] = []
    for index, value in enumerate(cases):
        case = _require_object(value, f"{label}.cases[{index}]")
        case_id = _require_identity(case.get("case_id"), f"{label}.cases[{index}].case_id")
        if case_id in result:
            raise AnnotationDataError(f"{label}.cases contains duplicate case_id {case_id!r}")
        if require_inventory_fields:
            _require_filename(case.get("video_filename"), f"inventory case {case_id}.video_filename")
            _require_sha256(case.get("video_sha256"), f"inventory case {case_id}.video_sha256")
            metadata = _require_object(
                case.get("inventory_metadata"),
                f"inventory case {case_id}.inventory_metadata",
            )
            fps = _require_positive_number(
                _metadata_value(metadata, ("fps", "frame_rate_fps"), f"inventory case {case_id}.inventory_metadata"),
                f"inventory case {case_id}.inventory_metadata.fps",
            )
            frame_count = _require_positive_integer(
                _metadata_value(metadata, ("frame_count", "video_frame_count"), f"inventory case {case_id}.inventory_metadata"),
                f"inventory case {case_id}.inventory_metadata.frame_count",
            )
            if not math.isfinite(fps) or frame_count <= 0:
                raise AnnotationDataError(f"inventory case {case_id} has invalid metadata")
        result[case_id] = case
        ordered.append(case)
    return result, tuple(ordered)


def _validate_specification_case(
    case: dict[str, Any], inventory_case: dict[str, Any]
) -> None:
    case_id = str(case["case_id"])
    primary_condition = _require_identity(
        case.get("primary_condition"), f"case specification {case_id}.primary_condition"
    )
    if not primary_condition:
        raise AnnotationDataError(f"case specification {case_id} has no condition")
    if "control_case_id" not in case:
        raise AnnotationDataError(
            f"case specification {case_id}.control_case_id is required"
        )
    control = case.get("control_case_id")
    if control is not None:
        _require_identity(control, f"case specification {case_id}.control_case_id")
    measurement = case.get("planned_condition_measurement")
    if measurement is None or not isinstance(measurement, (dict, str, int, float, bool)):
        raise AnnotationDataError(
            f"case specification {case_id}.planned_condition_measurement must be populated"
        )
    provisional = _require_string(
        case.get("provisional_validity"),
        f"case specification {case_id}.provisional_validity",
    )
    if provisional not in VALIDITY_VALUES:
        raise AnnotationDataError(
            f"case specification {case_id}.provisional_validity is unsupported"
        )
    timing = _require_object(
        case.get("planned_timing"), f"case specification {case_id}.planned_timing"
    )
    normalized_timing = _timing_values(timing, f"case specification {case_id}.planned_timing")
    boundaries = _require_object(
        case.get("planned_frame_boundaries"),
        f"case specification {case_id}.planned_frame_boundaries",
    )
    actual_boundaries = _frame_values(
        boundaries, f"case specification {case_id}.planned_frame_boundaries"
    )
    active_frame_names = (
        ("active_start_frame", "active_end_frame")
        if "active_start_frame" in boundaries or "active_end_frame" in boundaries
        else ("test_start_frame", "test_end_frame")
    )
    metadata = _require_object(
        inventory_case["inventory_metadata"],
        f"inventory case {case_id}.inventory_metadata",
    )
    fps = _require_positive_number(
        _metadata_value(metadata, ("fps", "frame_rate_fps"), f"inventory case {case_id}.inventory_metadata"),
        f"inventory case {case_id}.inventory_metadata.fps",
    )
    frame_count = _require_positive_integer(
        _metadata_value(metadata, ("frame_count", "video_frame_count"), f"inventory case {case_id}.inventory_metadata"),
        f"inventory case {case_id}.inventory_metadata.frame_count",
    )
    expected_boundaries = _derived_frame_values(
        normalized_timing,
        fps,
        f"case specification {case_id}.planned_frame_boundaries",
        (
            "calibration_start_frame",
            "calibration_end_frame",
            *active_frame_names,
        ),
    )
    if actual_boundaries != expected_boundaries:
        raise AnnotationDataError(
            f"case specification {case_id} frame boundaries do not match timing and FPS; "
            f"expected {expected_boundaries}, got {actual_boundaries}"
        )
    if actual_boundaries[-1] >= frame_count:
        raise AnnotationDataError(
            f"case specification {case_id} active window exceeds the inventory frame count"
        )
    question_ids = _require_list(
        case.get("human_question_ids"),
        f"case specification {case_id}.human_question_ids",
    )
    if not question_ids:
        raise AnnotationDataError(
            f"case specification {case_id}.human_question_ids must not be empty"
        )
    normalized_questions = [
        _require_identity(value, f"case specification {case_id}.human_question_ids")
        for value in question_ids
    ]
    if len(set(normalized_questions)) != len(normalized_questions):
        raise AnnotationDataError(
            f"case specification {case_id}.human_question_ids contains duplicates"
        )


def _validate_control_topology(specification_cases: Sequence[dict[str, Any]]) -> None:
    controls = {
        str(case["case_id"]): case["control_case_id"]
        for case in specification_cases
    }
    baselines = [case_id for case_id, control in controls.items() if control is None]
    if len(baselines) != 1:
        raise AnnotationDataError(
            "case specification must contain exactly one baseline with control_case_id null"
        )
    baseline = baselines[0]
    for case_id, control in controls.items():
        if case_id == baseline:
            continue
        if control not in controls:
            raise AnnotationDataError(
                f"case {case_id!r} references unknown control case {control!r}"
            )
        if control == case_id:
            raise AnnotationDataError(f"case {case_id!r} cannot control itself")
        visited = {case_id}
        cursor = control
        while cursor is not None:
            if cursor not in controls:
                raise AnnotationDataError(
                    f"control chain for case {case_id!r} references unknown "
                    f"control case {cursor!r}"
                )
            if cursor in visited:
                raise AnnotationDataError("control_case_id references contain a cycle")
            visited.add(cursor)
            cursor = controls[cursor]
        if baseline not in visited:
            raise AnnotationDataError(
                f"control chain for case {case_id!r} does not resolve to the baseline"
            )


def load_and_validate_sources(
    inventory_path: Path,
    session_provenance_path: Path,
    case_specification_path: Path,
) -> SourceBundle:
    """Load all three sources, recompute hashes, and validate them as one unit."""
    inventory = _read_json_source(inventory_path, "inventory")
    provenance = _read_json_source(session_provenance_path, "session provenance")
    specification = _read_json_source(case_specification_path, "case specification")
    resolved_paths = {inventory.path, provenance.path, specification.path}
    if len(resolved_paths) != 3:
        raise AnnotationDataError("inventory, provenance, and case specification must be distinct files")

    _require_version(inventory.payload, "inventory")
    _require_version(provenance.payload, "session provenance")
    _require_version(specification.payload, "case specification")

    revision = provenance.payload.get("provenance_revision")
    if type(revision) is not int or revision != 2:
        raise AnnotationDataError(
            "session provenance revision 2 is required; revision 1 is not authoritative"
        )
    superseded = _require_filename(
        provenance.payload.get("supersedes_filename"),
        "session provenance.supersedes_filename",
    )
    if REVISION_ONE_PATTERN.search(superseded) is None:
        raise AnnotationDataError(
            "session provenance.supersedes_filename must identify the superseded revision 1 file"
        )
    declared_identifiers = _require_list(
        provenance.payload.get("declared_direct_identifiers"),
        "session provenance.declared_direct_identifiers",
    )
    if declared_identifiers:
        raise AnnotationDataError(
            "session provenance must declare that no direct identifiers are present"
        )

    _validate_reference(provenance.payload, "inventory", inventory, "session provenance")
    _validate_reference(specification.payload, "inventory", inventory, "case specification")
    _validate_reference(
        specification.payload,
        "session_provenance",
        provenance,
        "case specification",
    )

    session_ids = {
        _require_identity(document.payload.get("session_id"), f"{label}.session_id")
        for document, label in (
            (inventory, "inventory"),
            (provenance, "session provenance"),
            (specification, "case specification"),
        )
    }
    subject_ids = {
        _require_identity(document.payload.get("subject_id"), f"{label}.subject_id")
        for document, label in (
            (inventory, "inventory"),
            (provenance, "session provenance"),
            (specification, "case specification"),
        )
    }
    if len(session_ids) != 1 or len(subject_ids) != 1:
        raise AnnotationDataError(
            "pseudonymous session_id and subject_id must agree across all source files"
        )

    inventory_cases, _ = _case_map(
        inventory.payload.get("cases"), "inventory", require_inventory_fields=True
    )
    specification_map, specification_cases = _case_map(
        specification.payload.get("cases"),
        "case specification",
        require_inventory_fields=False,
    )
    provenance_case_ids_raw = _require_list(
        provenance.payload.get("case_ids"), "session provenance.case_ids"
    )
    provenance_case_ids = [
        _require_identity(value, "session provenance.case_ids")
        for value in provenance_case_ids_raw
    ]
    if len(set(provenance_case_ids)) != len(provenance_case_ids):
        raise AnnotationDataError("session provenance.case_ids contains duplicates")
    expected_ids = set(inventory_cases)
    if set(specification_map) != expected_ids or set(provenance_case_ids) != expected_ids:
        raise AnnotationDataError(
            "case IDs must be unique and complete across inventory, provenance, and case specification"
        )

    for case in specification_cases:
        _validate_specification_case(case, inventory_cases[str(case["case_id"])])
    _validate_control_topology(specification_cases)
    return SourceBundle(
        inventory=inventory,
        provenance=provenance,
        case_specification=specification,
        inventory_cases=inventory_cases,
        specification_cases=specification_cases,
    )


def _pending_human_fields() -> dict[str, Any]:
    return {
        "actual_condition_observed": None,
        "final_expected_validity": None,
        "completed_repetitions": None,
        "complete_repetition_intervals": [],
        "incomplete_or_non_repetition_intervals": [],
        "visibility_observations": {},
        "protocol_observations": {},
        "calibration_motion_observed": None,
        "calibration_motion_interval": None,
        "confounders": [],
        "cutoff_handling": None,
        "ground_truth_rationale": None,
        "primary_annotation": {
            "annotator_id": None,
            "completed": None,
            "blinding_attestation": None,
        },
        "second_review": {
            "reviewer_id": None,
            "completed": None,
            "reviewed_completed_repetitions": None,
            "reviewed_final_expected_validity": None,
            "blinding_attestation": None,
        },
        "adjudication": {
            "resolved": None,
            "adjudicator_id": None,
            "completed_repetitions": None,
            "final_expected_validity": None,
            "rationale": None,
        },
        "decision": {"include_or_reject": None, "rejection_reason": None},
    }


def build_annotation_records(bundle: SourceBundle) -> tuple[dict[str, Any], ...]:
    """Build deterministic records in case-specification source order."""
    records: list[dict[str, Any]] = []
    inventory_payload = bundle.inventory.payload
    for specification_case in bundle.specification_cases:
        case_id = str(specification_case["case_id"])
        inventory_case = bundle.inventory_cases[case_id]
        record: dict[str, Any] = {
            "schema_version": ANNOTATION_SCHEMA_VERSION,
            "annotation_record_version": ANNOTATION_RECORD_VERSION,
            "case_id": case_id,
            "video_filename": inventory_case["video_filename"],
            "video_sha256": inventory_case["video_sha256"],
            "inventory_metadata": copy.deepcopy(inventory_case["inventory_metadata"]),
            "sources": {
                "inventory": {
                    "filename": bundle.inventory.filename,
                    "sha256": bundle.inventory.sha256,
                },
                "session_provenance": {
                    "filename": bundle.provenance.filename,
                    "provenance_revision": 2,
                    "sha256": bundle.provenance.sha256,
                },
                "case_specification": {
                    "filename": bundle.case_specification.filename,
                    "sha256": bundle.case_specification.sha256,
                },
            },
            "session_id": inventory_payload["session_id"],
            "subject_id": inventory_payload["subject_id"],
            "primary_condition": specification_case["primary_condition"],
            "control_case_id": specification_case["control_case_id"],
            "planned_condition_measurement": copy.deepcopy(
                specification_case["planned_condition_measurement"]
            ),
            "provisional_validity": {
                "value": specification_case["provisional_validity"],
                "authority": "provisional_only",
                "is_authoritative": False,
            },
            "planned_timing": copy.deepcopy(specification_case["planned_timing"]),
            "planned_frame_boundaries": copy.deepcopy(
                specification_case["planned_frame_boundaries"]
            ),
            "human_question_ids": copy.deepcopy(specification_case["human_question_ids"]),
            "annotation_status": "pending",
        }
        record.update(_pending_human_fields())
        records.append(record)
    return tuple(records)


def assert_sources_unchanged(bundle: SourceBundle) -> None:
    """Fail closed if any authoritative source changed after initial loading."""
    for document, label in (
        (bundle.inventory, "inventory"),
        (bundle.provenance, "session provenance"),
        (bundle.case_specification, "case specification"),
    ):
        if sha256_file(document.path) != document.sha256:
            raise AnnotationDataError(f"{label} changed after validation")


def _has_traversal(path: Path) -> bool:
    return any(part == ".." for part in path.parts)


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _safe_existing_directory(path: Path, field: str) -> Path:
    absolute = _absolute_path(path)
    _reject_symlink_components(absolute, field)
    try:
        result = _path_lstat(absolute)
    except FileNotFoundError as exc:
        raise AnnotationDataError(f"{field} must be an existing directory") from exc
    if not stat.S_ISDIR(result.st_mode) or _stat_is_reparse_point(result):
        raise AnnotationDataError(f"{field} must be an existing regular directory")
    resolved = absolute.resolve(strict=True)
    _reject_symlink_components(absolute, field)
    if resolved != absolute:
        raise AnnotationDataError(f"{field} resolution changed during validation")
    return resolved


def _verify_external_output_parent(path: Path, approved_parent: Path | None = None) -> Path:
    resolved = _safe_existing_directory(path, "output directory")
    repository_root = REPOSITORY_ROOT.resolve(strict=True)
    if _is_within(resolved, repository_root):
        raise AnnotationDataError("output directory must be outside the repository")
    if approved_parent is not None and resolved != approved_parent:
        raise AnnotationDataError("output directory resolution changed before creation")
    return resolved


def _verify_created_directory(path: Path, approved_parent: Path) -> os.stat_result:
    _reject_symlink_components(path, "output pack directory")
    result = _path_lstat(path)
    if not stat.S_ISDIR(result.st_mode) or _stat_is_reparse_point(result):
        raise AnnotationDataError("created output pack is not a regular directory")
    resolved = path.resolve(strict=True)
    if resolved.parent != approved_parent or not _is_within(resolved, approved_parent):
        raise AnnotationDataError("created output pack escaped its approved parent")
    return result


def _remove_owned_file(path: Path, owned: os.stat_result) -> None:
    try:
        current = _path_lstat(path)
    except FileNotFoundError:
        return
    if (
        stat.S_ISREG(current.st_mode)
        and not _stat_is_reparse_point(current)
        and os.path.samestat(owned, current)
    ):
        path.unlink()


def _remove_owned_directory(path: Path, owned: os.stat_result) -> None:
    try:
        current = _path_lstat(path)
    except FileNotFoundError:
        return
    if (
        stat.S_ISDIR(current.st_mode)
        and not _stat_is_reparse_point(current)
        and os.path.samestat(owned, current)
    ):
        shutil.rmtree(path)


def _validate_output_location(
    output_directory: Path, bundle: SourceBundle, records: Iterable[Mapping[str, Any]]
) -> tuple[Path, Path]:
    supplied = Path(output_directory)
    if _has_traversal(supplied):
        raise AnnotationDataError("output directory must not contain path traversal")
    _reject_symlink_components(supplied, "output directory")
    resolved = _absolute_path(supplied)
    if _is_within(resolved, REPOSITORY_ROOT):
        raise AnnotationDataError("output directory must be outside the repository")
    pack_name = f"chair-stand-annotation-pack-{bundle.case_specification.sha256[:16]}"
    pack_directory = resolved / pack_name
    if pack_directory.exists() or pack_directory.is_symlink():
        raise FileExistsError(f"output pack directory already exists: {pack_directory}")
    input_paths = {
        bundle.inventory.path,
        bundle.provenance.path,
        bundle.case_specification.path,
    }
    for record in records:
        annotation_path = (pack_directory / f"{record['case_id']}.annotation.json").resolve(
            strict=False
        )
        if not _is_within(annotation_path, pack_directory):
            raise AnnotationDataError("annotation output path escapes the pack directory")
        if annotation_path in input_paths:
            raise AnnotationDataError("an annotation output path would overwrite an input file")
        if annotation_path.exists() or annotation_path.is_symlink():
            raise FileExistsError(f"annotation file already exists: {annotation_path}")
    return resolved, pack_directory


def _write_json_exclusive(
    path: Path,
    payload: Mapping[str, Any],
    *,
    approved_parent: Path | None = None,
) -> None:
    reject_non_finite_numbers(payload, "output JSON")
    target = _absolute_path(path)
    parent = _safe_existing_directory(target.parent, "output parent")
    if approved_parent is not None and parent != approved_parent:
        raise AnnotationDataError("output parent changed before exclusive creation")
    _reject_symlink_components(target, "output target")
    owned: os.stat_result | None = None
    try:
        with target.open("x", encoding="utf-8", newline="\n") as stream:
            owned = os.fstat(stream.fileno())
            if not stat.S_ISREG(owned.st_mode) or _stat_is_reparse_point(owned):
                raise AnnotationDataError("created output target is not a regular file")
            try:
                json.dump(
                    payload,
                    stream,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                    allow_nan=False,
                )
            except (OverflowError, ValueError) as exc:
                raise AnnotationDataError(
                    "output JSON contains an unrepresentable numeric value"
                ) from exc
            stream.write("\n")
        _reject_symlink_components(target, "created output target")
        current = _path_lstat(target)
        if (
            _stat_is_reparse_point(current)
            or not stat.S_ISREG(current.st_mode)
            or not os.path.samestat(owned, current)
            or target.resolve(strict=True).parent != parent
        ):
            raise AnnotationDataError("created output target failed post-creation checks")
    except BaseException:
        if owned is not None:
            _remove_owned_file(target, owned)
        raise


def generate_annotation_pack(
    inventory_path: Path,
    session_provenance_path: Path,
    case_specification_path: Path,
    output_directory: Path,
) -> Path:
    """Validate all inputs and create a non-overwriting pending annotation pack."""
    bundle = load_and_validate_sources(
        inventory_path, session_provenance_path, case_specification_path
    )
    records = build_annotation_records(bundle)
    for index, record in enumerate(records):
        reject_non_finite_numbers(record, f"annotations[{index}]")
    output_root, pack_directory = _validate_output_location(
        output_directory, bundle, records
    )
    assert_sources_unchanged(bundle)

    output_root.mkdir(parents=True, exist_ok=True)
    approved_parent = _verify_external_output_parent(output_root)
    pack_directory = approved_parent / pack_directory.name
    assert_sources_unchanged(bundle)
    _verify_external_output_parent(output_root, approved_parent)
    pack_directory.mkdir(mode=0o700, exist_ok=False)
    owned_pack = _path_lstat(pack_directory)
    try:
        _verify_created_directory(pack_directory, approved_parent)
        for record in records:
            _write_json_exclusive(
                pack_directory / f"{record['case_id']}.annotation.json",
                record,
                approved_parent=pack_directory,
            )
        assert_sources_unchanged(bundle)
        _verify_external_output_parent(output_root, approved_parent)
        _verify_created_directory(pack_directory, approved_parent)
    except BaseException:
        _remove_owned_directory(pack_directory, owned_pack)
        raise
    return pack_directory


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate pending chair-stand annotations from authoritative JSON"
    )
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--session-provenance", required=True, type=Path)
    parser.add_argument("--case-specification", required=True, type=Path)
    parser.add_argument("--output-directory", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        pack = generate_annotation_pack(
            args.inventory,
            args.session_provenance,
            args.case_specification,
            args.output_directory,
        )
    except (AnnotationDataError, FileExistsError, OSError) as exc:
        print(f"annotation pack generation failed: {exc}", file=sys.stderr)
        return 2
    print(pack)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
