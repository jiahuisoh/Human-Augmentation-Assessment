"""Read-only validation and approval derivation for chair-stand annotations.

Standard-library identity and reparse-point checks narrow filesystem races but
cannot eliminate every race available to a privileged concurrent process.
"""

from __future__ import annotations

import argparse
import stat
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

from validation.chair_stand.generate_annotation_pack import (
    AnnotationDataError,
    IDENTITY_PATTERN,
    SourceBundle,
    VALIDITY_VALUES,
    _has_traversal,
    _is_within,
    _path_lstat,
    _read_json_source,
    _reject_symlink_components,
    _require_finite_number,
    _safe_existing_directory,
    _stat_is_reparse_point,
    _write_json_exclusive,
    assert_sources_unchanged,
    build_annotation_records,
    load_and_validate_sources,
    timing_values,
)


REPORT_SCHEMA_VERSION = 1
VISIBILITY_VALUES = frozenset(
    {
        "visible",
        "not_visible_by_design",
        "not_visible_unintentionally",
        "not_assessable",
    }
)
MACHINE_FIELDS = (
    "schema_version",
    "annotation_record_version",
    "case_id",
    "video_filename",
    "video_sha256",
    "inventory_metadata",
    "sources",
    "session_id",
    "subject_id",
    "primary_condition",
    "control_case_id",
    "planned_condition_measurement",
    "provisional_validity",
    "planned_timing",
    "planned_frame_boundaries",
    "human_question_ids",
    "annotation_status",
)
HUMAN_FIELDS = frozenset(
    {
        "actual_condition_observed",
        "final_expected_validity",
        "completed_repetitions",
        "complete_repetition_intervals",
        "incomplete_or_non_repetition_intervals",
        "visibility_observations",
        "protocol_observations",
        "calibration_motion_observed",
        "calibration_motion_interval",
        "confounders",
        "cutoff_handling",
        "ground_truth_rationale",
        "primary_annotation",
        "second_review",
        "adjudication",
        "decision",
    }
)
ANNOTATION_KEYS = frozenset(MACHINE_FIELDS) | HUMAN_FIELDS
PRIMARY_ANNOTATION_KEYS = frozenset(
    {"annotator_id", "completed", "blinding_attestation"}
)
SECOND_REVIEW_KEYS = frozenset(
    {
        "reviewer_id",
        "completed",
        "reviewed_completed_repetitions",
        "reviewed_final_expected_validity",
        "blinding_attestation",
    }
)
ADJUDICATION_KEYS = frozenset(
    {
        "resolved",
        "adjudicator_id",
        "completed_repetitions",
        "final_expected_validity",
        "rationale",
    }
)
DECISION_KEYS = frozenset({"include_or_reject", "rejection_reason"})
INTERVAL_KEYS = frozenset({"start_s", "end_s"})
VISIBILITY_KEYS_BY_CASE = {
    "cs-real-clean-004": frozenset({"whole_body", "chair"}),
    "cs-real-angle30-005": frozenset({"body"}),
    "cs-real-ankles-cropped-006": frozenset(
        {"ankles", "feet", "hips", "knees", "chair"}
    ),
    "cs-real-incomplete-007": frozenset(),
    "cs-real-calibration-motion-008": frozenset(),
}
PROTOCOL_KEYS_BY_CASE = {
    "cs-real-clean-004": frozenset(
        {"clean_side_view_observed", "protocol_adherence"}
    ),
    "cs-real-angle30-005": frozenset(
        {
            "intended_angle_confirmed",
            "measured_camera_angle_degrees",
            "distance_and_framing_comparable",
            "camera_angle_only_material_change",
        }
    ),
    "cs-real-ankles-cropped-006": frozenset(
        {"crop_stable", "physical_repetition_complete"}
    ),
    "cs-real-incomplete-007": frozenset(
        {"partial_attempts_documented", "complete_upright_repetition_observed"}
    ),
    "cs-real-calibration-motion-008": frozenset(
        {"returned_upright_before_calibration_end"}
    ),
}
FORBIDDEN_RESULT_FIELDS = frozenset(
    {
        "approved_for_inference",
        "detected_repetitions",
        "calibration_quality",
        "pose",
        "pose_results",
        "pose_output",
        "landmarks",
        "landmark_output",
        "landmark_outputs",
        "pose_landmarks",
        "rep_error",
        "passed",
        "failure_category",
        "runtime_failure_category",
        "derived_status",
        "model_prediction",
        "cv_result",
        "inference_manifest",
    }
)


class AnnotationValidationError(AnnotationDataError):
    """Raised when the annotation directory or report target is unsafe."""


def _is_non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value) and value == value.strip()


def _is_portable_identity(value: Any) -> bool:
    return (
        _is_non_empty_string(value)
        and IDENTITY_PATTERN.fullmatch(value) is not None
        and value not in {".", ".."}
    )


def _is_non_negative_integer(value: Any) -> bool:
    return type(value) is int and value >= 0


def _finite_number_or_error(
    value: Any, field: str, errors: list[str]
) -> float | None:
    try:
        return _require_finite_number(value, field, minimum=None)
    except AnnotationDataError as exc:
        errors.append(str(exc))
        return None


def _find_forbidden_fields(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            location = f"{prefix}.{key}" if prefix else key
            if key in FORBIDDEN_RESULT_FIELDS:
                found.append(location)
            found.extend(_find_forbidden_fields(child, location))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_find_forbidden_fields(child, f"{prefix}[{index}]"))
    return found


def _reject_unknown_keys(
    value: Any,
    allowed: frozenset[str],
    field: str,
    errors: list[str],
) -> None:
    if not isinstance(value, dict):
        return
    unknown = sorted(set(value) - allowed)
    if unknown:
        errors.append(f"{field} contains unknown keys: {', '.join(unknown)}")


def _reject_unknown_authoritative_keys(
    supplied: Any,
    expected: Any,
    field: str,
    errors: list[str],
) -> None:
    """Close machine-owned containers against the generated authoritative shape."""
    if isinstance(expected, dict) and isinstance(supplied, dict):
        unknown = sorted(set(supplied) - set(expected))
        if unknown:
            errors.append(f"{field} contains unknown keys: {', '.join(unknown)}")
        for key in set(supplied) & set(expected):
            _reject_unknown_authoritative_keys(
                supplied[key], expected[key], f"{field}.{key}", errors
            )
    elif isinstance(expected, list) and isinstance(supplied, list):
        for index, (child, expected_child) in enumerate(zip(supplied, expected)):
            _reject_unknown_authoritative_keys(
                child, expected_child, f"{field}[{index}]", errors
            )


def _validate_closed_schema(
    record: Mapping[str, Any],
    expected: Mapping[str, Any],
    errors: list[str],
) -> None:
    _reject_unknown_keys(record, ANNOTATION_KEYS, "annotation", errors)
    if "control_case_id" not in record:
        errors.append("control_case_id is required by the annotation schema")
    for field in MACHINE_FIELDS:
        _reject_unknown_authoritative_keys(
            record.get(field), expected.get(field), field, errors
        )

    for field, allowed in (
        ("primary_annotation", PRIMARY_ANNOTATION_KEYS),
        ("second_review", SECOND_REVIEW_KEYS),
        ("adjudication", ADJUDICATION_KEYS),
        ("decision", DECISION_KEYS),
    ):
        _reject_unknown_keys(record.get(field), allowed, field, errors)

    for field in (
        "complete_repetition_intervals",
        "incomplete_or_non_repetition_intervals",
    ):
        intervals = record.get(field)
        if isinstance(intervals, list):
            for index, interval in enumerate(intervals):
                _reject_unknown_keys(
                    interval, INTERVAL_KEYS, f"{field}[{index}]", errors
                )
    _reject_unknown_keys(
        record.get("calibration_motion_interval"),
        INTERVAL_KEYS,
        "calibration_motion_interval",
        errors,
    )

    case_id = record.get("case_id")
    visibility_keys = VISIBILITY_KEYS_BY_CASE.get(case_id, frozenset())
    protocol_keys = PROTOCOL_KEYS_BY_CASE.get(case_id, frozenset())
    _reject_unknown_keys(
        record.get("visibility_observations"),
        visibility_keys,
        "visibility_observations",
        errors,
    )
    _reject_unknown_keys(
        record.get("protocol_observations"),
        protocol_keys,
        "protocol_observations",
        errors,
    )


def _parse_interval(
    value: Any,
    field: str,
    window_start: float,
    window_end: float,
    errors: list[str],
) -> tuple[float, float] | None:
    if not isinstance(value, dict) or set(value) != {"start_s", "end_s"}:
        errors.append(f"{field} must contain exactly start_s and end_s")
        return None
    start = _finite_number_or_error(value.get("start_s"), f"{field}.start_s", errors)
    end = _finite_number_or_error(value.get("end_s"), f"{field}.end_s", errors)
    if start is None or end is None:
        return None
    normalized = (start, end)
    if normalized[0] >= normalized[1]:
        errors.append(f"{field} must have start_s < end_s")
        return None
    if normalized[0] < window_start or normalized[1] > window_end:
        errors.append(f"{field} must be contained in its authoritative window")
        return None
    return normalized


def _parse_intervals(
    value: Any,
    field: str,
    window_start: float,
    window_end: float,
    pending: list[str],
    errors: list[str],
    *,
    empty_is_pending: bool = False,
) -> list[tuple[float, float]]:
    if not isinstance(value, list):
        errors.append(f"{field} must be an array")
        return []
    if empty_is_pending and not value:
        pending.append(f"{field} is required")
    parsed: list[tuple[float, float]] = []
    for index, interval in enumerate(value):
        result = _parse_interval(
            interval,
            f"{field}[{index}]",
            window_start,
            window_end,
            errors,
        )
        if result is not None:
            parsed.append(result)
    for previous, current in zip(parsed, parsed[1:]):
        if current[0] < previous[0]:
            errors.append(f"{field} must be ordered by start_s")
            break
        if current[0] < previous[1]:
            errors.append(f"{field} intervals must not overlap")
            break
    return parsed


def _require_visibility(
    observations: Mapping[str, Any],
    key: str,
    pending: list[str],
    errors: list[str],
    *,
    expected: str | None = None,
) -> None:
    value = observations.get(key)
    if value is None:
        pending.append(f"visibility_observations.{key} is required")
    elif value not in VISIBILITY_VALUES:
        errors.append(
            f"visibility_observations.{key} must use the visibility enum"
        )
    elif expected is not None and value != expected:
        errors.append(
            f"visibility_observations.{key} contradicts the required {expected!r} state"
        )


def _require_protocol_boolean(
    observations: Mapping[str, Any],
    key: str,
    pending: list[str],
    errors: list[str],
    *,
    expected: bool | None = None,
) -> None:
    value = observations.get(key)
    if value is None:
        pending.append(f"protocol_observations.{key} is required")
    elif type(value) is not bool:
        errors.append(f"protocol_observations.{key} must be a boolean")
    elif expected is not None and value is not expected:
        errors.append(
            f"protocol_observations.{key} contradicts the case specification"
        )


def _validate_case_specific_rules(
    record: Mapping[str, Any],
    complete_intervals: Sequence[tuple[float, float]],
    incomplete_intervals: Sequence[tuple[float, float]],
    pending: list[str],
    errors: list[str],
) -> None:
    case_id = record.get("case_id")
    visibility = record.get("visibility_observations")
    protocol = record.get("protocol_observations")
    if not isinstance(visibility, dict) or not isinstance(protocol, dict):
        return

    if case_id == "cs-real-clean-004":
        _require_protocol_boolean(
            protocol, "clean_side_view_observed", pending, errors, expected=True
        )
        _require_visibility(visibility, "whole_body", pending, errors, expected="visible")
        _require_visibility(visibility, "chair", pending, errors, expected="visible")
        _require_protocol_boolean(
            protocol, "protocol_adherence", pending, errors, expected=True
        )
    elif case_id == "cs-real-angle30-005":
        confirmed = protocol.get("intended_angle_confirmed")
        measured = protocol.get("measured_camera_angle_degrees")
        if confirmed is None and measured is None:
            pending.append(
                "protocol_observations must confirm or measure the intended angle"
            )
        elif confirmed is not None and type(confirmed) is not bool:
            errors.append(
                "protocol_observations.intended_angle_confirmed must be a boolean"
            )
        elif confirmed is False and measured is None:
            errors.append("the intended camera angle was neither confirmed nor measured")
        if measured is not None:
            _finite_number_or_error(
                measured,
                "protocol_observations.measured_camera_angle_degrees",
                errors,
            )
        _require_visibility(visibility, "body", pending, errors)
        _require_protocol_boolean(
            protocol,
            "distance_and_framing_comparable",
            pending,
            errors,
            expected=True,
        )
        _require_protocol_boolean(
            protocol,
            "camera_angle_only_material_change",
            pending,
            errors,
            expected=True,
        )
    elif case_id == "cs-real-ankles-cropped-006":
        _require_visibility(
            visibility, "ankles", pending, errors, expected="not_visible_by_design"
        )
        _require_visibility(
            visibility, "feet", pending, errors, expected="not_visible_by_design"
        )
        for key in ("hips", "knees", "chair"):
            _require_visibility(visibility, key, pending, errors)
        _require_protocol_boolean(
            protocol, "crop_stable", pending, errors, expected=True
        )
        _require_protocol_boolean(
            protocol,
            "physical_repetition_complete",
            pending,
            errors,
            expected=True,
        )
    elif case_id == "cs-real-incomplete-007":
        _require_protocol_boolean(
            protocol, "partial_attempts_documented", pending, errors, expected=True
        )
        _require_protocol_boolean(
            protocol,
            "complete_upright_repetition_observed",
            pending,
            errors,
            expected=False,
        )
        if not incomplete_intervals:
            pending.append(
                "incomplete_or_non_repetition_intervals is required for the incomplete case"
            )
        if (
            record.get("completed_repetitions") is not None
            and record.get("completed_repetitions") != 0
        ):
            errors.append("the incomplete case must have completed_repetitions equal to zero")
        if complete_intervals:
            errors.append("the incomplete case must not contain complete repetition intervals")
    elif case_id == "cs-real-calibration-motion-008":
        if record.get("calibration_motion_observed") is False:
            errors.append("the calibration-motion case must record observed calibration motion")
        _require_protocol_boolean(
            protocol,
            "returned_upright_before_calibration_end",
            pending,
            errors,
            expected=True,
        )


def _review_case(
    record: Mapping[str, Any], expected: Mapping[str, Any]
) -> tuple[str, list[str], list[str]]:
    errors: list[str] = []
    pending: list[str] = []
    forbidden = _find_forbidden_fields(record)
    if forbidden:
        errors.append("forbidden manually supplied or CV-result fields: " + ", ".join(forbidden))
    _validate_closed_schema(record, expected, errors)

    condition = record.get("actual_condition_observed")
    if condition is None:
        pending.append("actual_condition_observed is required")
    elif not _is_non_empty_string(condition):
        errors.append("actual_condition_observed must be a non-empty string")
    elif condition != record.get("primary_condition"):
        errors.append("actual_condition_observed contradicts primary_condition")

    validity = record.get("final_expected_validity")
    if validity is None:
        pending.append("final_expected_validity is required")
    elif validity not in VALIDITY_VALUES:
        errors.append("final_expected_validity is unsupported")

    repetitions = record.get("completed_repetitions")
    if repetitions is None:
        pending.append("completed_repetitions is required")
    elif not _is_non_negative_integer(repetitions):
        errors.append("completed_repetitions must be a non-negative integer")

    try:
        calibration_start, calibration_end, active_start, active_end = timing_values(
            record.get("planned_timing", {})
        )
    except AnnotationDataError as exc:
        errors.append(str(exc))
        calibration_start = calibration_end = active_start = active_end = 0.0

    complete_intervals = _parse_intervals(
        record.get("complete_repetition_intervals"),
        "complete_repetition_intervals",
        active_start,
        active_end,
        pending,
        errors,
    )
    incomplete_intervals = _parse_intervals(
        record.get("incomplete_or_non_repetition_intervals"),
        "incomplete_or_non_repetition_intervals",
        active_start,
        active_end,
        pending,
        errors,
    )
    if _is_non_negative_integer(repetitions) and repetitions != len(complete_intervals):
        errors.append(
            "completed_repetitions must equal the number of complete repetition intervals"
        )
    all_intervals = sorted(
        [(start, end, "complete") for start, end in complete_intervals]
        + [(start, end, "incomplete") for start, end in incomplete_intervals]
    )
    for previous, current in zip(all_intervals, all_intervals[1:]):
        if current[0] < previous[1]:
            errors.append("complete and incomplete repetition intervals must not overlap")
            break

    visibility = record.get("visibility_observations")
    if not isinstance(visibility, dict):
        errors.append("visibility_observations must be an object")
    else:
        for key, value in visibility.items():
            if not _is_non_empty_string(key) or value not in VISIBILITY_VALUES:
                errors.append("visibility_observations contains an invalid key or enum value")
                break
    protocol = record.get("protocol_observations")
    if not isinstance(protocol, dict):
        errors.append("protocol_observations must be an object")

    calibration_observed = record.get("calibration_motion_observed")
    if calibration_observed is None:
        pending.append("calibration_motion_observed is required")
    elif type(calibration_observed) is not bool:
        errors.append("calibration_motion_observed must be a boolean")
    calibration_interval = record.get("calibration_motion_interval")
    if calibration_observed is True:
        if calibration_interval is None:
            pending.append("calibration_motion_interval is required when motion was observed")
        else:
            _parse_interval(
                calibration_interval,
                "calibration_motion_interval",
                calibration_start,
                calibration_end,
                errors,
            )
    elif calibration_interval is not None:
        errors.append("calibration_motion_interval must be empty when no motion was observed")

    confounders = record.get("confounders")
    if not isinstance(confounders, list) or any(
        not _is_non_empty_string(item) for item in confounders
    ):
        errors.append("confounders must be an array of non-empty strings")
    cutoff = record.get("cutoff_handling")
    if cutoff is None:
        pending.append("cutoff_handling is required")
    elif not _is_non_empty_string(cutoff):
        errors.append("cutoff_handling must be a non-empty string")
    rationale = record.get("ground_truth_rationale")
    if rationale is None:
        pending.append("ground_truth_rationale is required")
    elif not _is_non_empty_string(rationale):
        errors.append("ground_truth_rationale must be a non-empty string")

    primary = record.get("primary_annotation")
    if not isinstance(primary, dict):
        errors.append("primary_annotation must be an object")
        primary = {}
    primary_id = primary.get("annotator_id")
    if primary_id is None:
        pending.append("primary_annotation.annotator_id is required")
    elif not _is_portable_identity(primary_id):
        errors.append(
            "primary_annotation.annotator_id must contain only portable identifier characters"
        )
    completed = primary.get("completed")
    if completed is not True:
        if completed in (None, False):
            pending.append("primary_annotation.completed must be true")
        else:
            errors.append("primary_annotation.completed must be a boolean")
    primary_blinding = primary.get("blinding_attestation")
    if primary_blinding is not True:
        if primary_blinding is None:
            pending.append("primary reviewer blinding attestation is required")
        elif primary_blinding is False:
            errors.append("primary reviewer did not attest to annotation before CV results")
        else:
            errors.append("primary reviewer blinding attestation must be a boolean")

    second = record.get("second_review")
    if not isinstance(second, dict):
        errors.append("second_review must be an object")
        second = {}
    second_id = second.get("reviewer_id")
    if second_id is None:
        pending.append("second_review.reviewer_id is required")
    elif not _is_portable_identity(second_id):
        errors.append(
            "second_review.reviewer_id must contain only portable identifier characters"
        )
    elif _is_portable_identity(primary_id) and second_id == primary_id:
        errors.append("primary and second reviewer IDs must be distinct")
    second_completed = second.get("completed")
    if second_completed is not True:
        if second_completed in (None, False):
            pending.append("second_review.completed must be true")
        else:
            errors.append("second_review.completed must be a boolean")
    reviewed_count = second.get("reviewed_completed_repetitions")
    if reviewed_count is None:
        pending.append("second reviewer repetition count is required")
    elif not _is_non_negative_integer(reviewed_count):
        errors.append("second reviewer repetition count must be a non-negative integer")
    reviewed_validity = second.get("reviewed_final_expected_validity")
    if reviewed_validity is None:
        pending.append("second reviewer final validity is required")
    elif reviewed_validity not in VALIDITY_VALUES:
        errors.append("second reviewer final validity is unsupported")
    second_blinding = second.get("blinding_attestation")
    if second_blinding is not True:
        if second_blinding is None:
            pending.append("second reviewer blinding attestation is required")
        elif second_blinding is False:
            errors.append("second reviewer did not attest to annotation before CV results")
        else:
            errors.append("second reviewer blinding attestation must be a boolean")

    adjudication = record.get("adjudication")
    if not isinstance(adjudication, dict):
        errors.append("adjudication must be an object")
        adjudication = {}
    disagreement = (
        _is_non_negative_integer(repetitions)
        and _is_non_negative_integer(reviewed_count)
        and repetitions != reviewed_count
    ) or (
        validity in VALIDITY_VALUES
        and reviewed_validity in VALIDITY_VALUES
        and validity != reviewed_validity
    )
    adjudication_required = disagreement or record.get("case_id") == "cs-real-calibration-motion-008"
    if adjudication_required:
        resolved = adjudication.get("resolved")
        if resolved is not True:
            if disagreement:
                errors.append("review disagreement requires resolved adjudication")
            else:
                pending.append("case rule requires resolved adjudication")
        else:
            adjudicator_id = adjudication.get("adjudicator_id")
            if adjudicator_id is None:
                errors.append("resolved adjudication requires adjudicator_id")
            elif not _is_portable_identity(adjudicator_id):
                errors.append(
                    "adjudication.adjudicator_id must contain only portable identifier characters"
                )
            elif adjudicator_id in {primary_id, second_id}:
                errors.append("adjudicator_id must be independent of both reviewers")
            adjudicated_count = adjudication.get("completed_repetitions")
            adjudicated_validity = adjudication.get("final_expected_validity")
            if not _is_non_negative_integer(adjudicated_count):
                errors.append("resolved adjudication requires a non-negative repetition count")
            elif _is_non_negative_integer(repetitions) and adjudicated_count != repetitions:
                errors.append("top-level repetition count must match resolved adjudication")
            if adjudicated_validity not in VALIDITY_VALUES:
                errors.append("resolved adjudication requires final validity")
            elif validity in VALIDITY_VALUES and adjudicated_validity != validity:
                errors.append("top-level final validity must match resolved adjudication")
            if not _is_non_empty_string(adjudication.get("rationale")):
                errors.append("resolved adjudication requires a rationale")
    else:
        reviews_complete = (
            completed is True
            and second_completed is True
            and _is_non_negative_integer(repetitions)
            and _is_non_negative_integer(reviewed_count)
            and validity in VALIDITY_VALUES
            and reviewed_validity in VALIDITY_VALUES
        )
        supplied_adjudication = {
            key: adjudication.get(key)
            for key in (
                "adjudicator_id",
                "completed_repetitions",
                "final_expected_validity",
                "rationale",
            )
            if adjudication.get(key) not in (None, "")
        }
        if reviews_complete and adjudication.get("resolved") is not False:
            errors.append(
                "reviewer agreement requires adjudication.resolved false "
                "to indicate that adjudication was not required"
            )
        if supplied_adjudication:
            errors.append(
                "adjudication values must be empty when adjudication is not required: "
                + ", ".join(sorted(supplied_adjudication))
            )
        if adjudication.get("resolved") is True:
            errors.append(
                "adjudication.resolved must not be true when adjudication is not required"
            )

    decision = record.get("decision")
    if not isinstance(decision, dict):
        errors.append("decision must be an object")
        decision = {}
    include_or_reject = decision.get("include_or_reject")
    if include_or_reject is None:
        pending.append("decision.include_or_reject is required")
    elif include_or_reject not in {"include", "reject"}:
        errors.append("decision.include_or_reject must be 'include' or 'reject'")
    reason = decision.get("rejection_reason")
    if include_or_reject == "reject" and not _is_non_empty_string(reason):
        errors.append("rejected cases require a rejection reason")
    if include_or_reject == "include" and reason not in (None, ""):
        errors.append("included cases must not provide a rejection reason")

    _validate_case_specific_rules(
        record,
        complete_intervals,
        incomplete_intervals,
        pending,
        errors,
    )
    if errors:
        return "invalid", errors, pending
    if pending:
        return "pending", errors, pending
    if include_or_reject == "reject":
        return "rejected", errors, pending
    return "approved", errors, pending


def _annotation_documents(annotation_directory: Path) -> list[dict[str, Any]]:
    supplied = Path(annotation_directory)
    if _has_traversal(supplied):
        raise AnnotationValidationError(
            "annotation directory must not contain path traversal"
        )
    supplied = _safe_existing_directory(supplied, "annotation directory")
    documents: list[dict[str, Any]] = []
    for path in sorted(supplied.iterdir(), key=lambda item: item.name):
        _reject_symlink_components(path, "annotation directory entry")
        result = _path_lstat(path)
        if _stat_is_reparse_point(result):
            raise AnnotationValidationError(
                "annotation directory must not contain reparse points"
            )
        if stat.S_ISDIR(result.st_mode):
            raise AnnotationValidationError("annotation directory must not contain subdirectories")
        if path.suffix.lower() != ".json":
            continue
        if not stat.S_ISREG(result.st_mode):
            raise AnnotationValidationError(
                "annotation JSON entries must be regular files"
            )
        documents.append(_read_json_source(path, f"annotation {path.name}").payload)
    return documents


def validate_annotation_directory(
    bundle: SourceBundle, annotation_directory: Path
) -> dict[str, Any]:
    """Validate every requested case and derive status without changing sources."""
    expected_records = {
        str(record["case_id"]): record for record in build_annotation_records(bundle)
    }
    supplied_records: dict[str, dict[str, Any]] = {}
    duplicate_ids: set[str] = set()
    unknown_ids: set[str] = set()
    directory_errors: list[str] = []
    for record in _annotation_documents(annotation_directory):
        case_id = record.get("case_id")
        if not _is_portable_identity(case_id):
            directory_errors.append("an annotation has a missing or invalid case_id")
            continue
        if case_id in supplied_records:
            duplicate_ids.add(case_id)
            continue
        supplied_records[case_id] = record
        if case_id not in expected_records:
            unknown_ids.add(case_id)
    if duplicate_ids:
        directory_errors.append(
            "duplicate annotation case IDs: " + ", ".join(sorted(duplicate_ids))
        )
    if unknown_ids:
        directory_errors.append(
            "unknown annotation case IDs: " + ", ".join(sorted(unknown_ids))
        )

    case_results: list[dict[str, Any]] = []
    for case_id, expected in expected_records.items():
        supplied = supplied_records.get(case_id)
        if supplied is None:
            case_results.append(
                {
                    "case_id": case_id,
                    "derived_status": "pending",
                    "errors": [],
                    "incomplete_fields": ["annotation record is missing"],
                }
            )
            continue
        machine_errors: list[str] = []
        for field in MACHINE_FIELDS:
            if supplied.get(field) != expected.get(field):
                machine_errors.append(
                    f"{field} does not exactly match the authoritative source data"
                )
        status, errors, pending = _review_case(supplied, expected)
        errors = machine_errors + errors
        if machine_errors or case_id in duplicate_ids:
            status = "invalid"
        case_results.append(
            {
                "case_id": case_id,
                "derived_status": status,
                "errors": errors,
                "incomplete_fields": pending,
            }
        )

    statuses = [result["derived_status"] for result in case_results]
    if directory_errors or "invalid" in statuses:
        overall = "invalid"
    elif "rejected" in statuses:
        overall = "rejected"
    elif "pending" in statuses:
        overall = "pending"
    else:
        overall = "approved"
    return {
        "report_schema_version": REPORT_SCHEMA_VERSION,
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
        "overall_status": overall,
        "all_selected_cases_approved": overall == "approved",
        "directory_errors": directory_errors,
        "case_results": case_results,
    }


def _report_output_location(path: Path) -> tuple[Path, Path]:
    supplied = Path(path)
    if _has_traversal(supplied):
        raise AnnotationValidationError("report output must not contain path traversal")
    if supplied.name in {"", ".", ".."}:
        raise AnnotationValidationError("report output must name a file")
    parent = _safe_existing_directory(supplied.parent, "report output parent")
    target = parent / supplied.name
    _reject_symlink_components(target, "report output")
    try:
        _path_lstat(target)
    except FileNotFoundError:
        pass
    else:
        raise FileExistsError(f"validation report already exists: {target}")
    return parent, target


def _write_report(
    path: Path,
    report: Mapping[str, Any],
    *,
    approved_parent: Path,
) -> None:
    parent, target = _report_output_location(path)
    if parent != approved_parent:
        raise AnnotationValidationError(
            "report output parent changed before exclusive creation"
        )
    _write_json_exclusive(target, report, approved_parent=approved_parent)


def validate_annotations(
    inventory_path: Path,
    session_provenance_path: Path,
    case_specification_path: Path,
    annotation_directory: Path,
    report_output: Path | None = None,
) -> dict[str, Any]:
    bundle = load_and_validate_sources(
        inventory_path, session_provenance_path, case_specification_path
    )
    report = validate_annotation_directory(bundle, annotation_directory)
    assert_sources_unchanged(bundle)
    if report_output is not None:
        input_paths = {
            bundle.inventory.path,
            bundle.provenance.path,
            bundle.case_specification.path,
        }
        approved_parent, target = _report_output_location(Path(report_output))
        if target in input_paths:
            raise AnnotationValidationError("report output must not target a source file")
        annotation_root = _safe_existing_directory(
            annotation_directory, "annotation directory"
        )
        if _is_within(target, annotation_root):
            raise AnnotationValidationError(
                "report output must be outside the annotation directory"
            )
        assert_sources_unchanged(bundle)
        _reject_symlink_components(annotation_root, "annotation directory")
        approved_parent_recheck, target_recheck = _report_output_location(
            Path(report_output)
        )
        if approved_parent_recheck != approved_parent or target_recheck != target:
            raise AnnotationValidationError(
                "report output location changed before exclusive creation"
            )
        if _is_within(target_recheck, annotation_root):
            raise AnnotationValidationError(
                "report output must be outside the annotation directory"
            )
        _write_report(target, report, approved_parent=approved_parent)
    return report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate human chair-stand annotations and derive review status"
    )
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--session-provenance", required=True, type=Path)
    parser.add_argument("--case-specification", required=True, type=Path)
    parser.add_argument("--annotation-directory", required=True, type=Path)
    parser.add_argument("--report-output", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        report = validate_annotations(
            args.inventory,
            args.session_provenance,
            args.case_specification,
            args.annotation_directory,
            args.report_output,
        )
    except (AnnotationDataError, FileExistsError, OSError) as exc:
        print(f"annotation validation failed: {exc}", file=sys.stderr)
        return 2
    return 0 if report["overall_status"] == "approved" else 1


if __name__ == "__main__":
    raise SystemExit(main())
