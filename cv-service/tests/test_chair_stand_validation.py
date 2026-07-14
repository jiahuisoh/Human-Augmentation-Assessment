"""Tests for the pure chair-stand validation data contracts."""

from __future__ import annotations

import csv
import hashlib
import io
import json
from copy import deepcopy
from pathlib import Path

import pytest

from validation.chair_stand.schema import (
    CaseResult,
    DetectedOutcome,
    ExpectedOutcome,
    ExpectedValidity,
    FailureCategory,
    GenerationProvenance,
    ManifestValidationError,
    ProcessingStatus,
    Sex,
    SourceType,
    SubjectAnnotation,
    TimingAnnotation,
    ValidationCase,
    ValidationManifest,
    ViewMetadata,
    compare_outcomes,
    load_manifest,
    manifest_from_payload,
    sha256_file,
    sha256_json,
)


VIDEO_SHA256 = "a" * 64
CONFIG_SHA256 = "b" * 64
TEMPLATE_PATH = (
    Path(__file__).parents[1]
    / "validation"
    / "chair_stand"
    / "manifest.template.json"
)


def _valid_payload() -> dict:
    return {
        "schema_version": 1,
        "dataset_id": "chair-stand-test",
        "cases": [
            {
                "case_id": "case-001",
                "video_path": "../../local_validation_videos/case-001.mp4",
                "video_sha256": VIDEO_SHA256.upper(),
                "source_type": "real",
                "expected": {
                    "validity": "valid_movement",
                    "repetitions": 5,
                    "minimum_calibration_quality": 0.5,
                },
                "subject": {"age": 70, "sex": "female", "height_cm": 160.0},
                "timing": {
                    "calibration_start_s": 0.0,
                    "calibration_end_s": 3.0,
                    "test_start_s": 6.5,
                    "test_end_s": 36.5,
                },
                "view": {
                    "camera_angle": "side",
                    "distance": "full_body",
                    "lighting": "normal",
                    "occlusion": "none",
                },
                "generation": None,
                "notes": "Labelled fixture metadata only.",
            }
        ],
    }


def _write_manifest(tmp_path: Path, payload: dict) -> Path:
    path = tmp_path / "manifests" / "manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _expected(
    validity: ExpectedValidity = ExpectedValidity.VALID_MOVEMENT,
    repetitions: int = 5,
    minimum_quality: float = 0.5,
) -> ExpectedOutcome:
    return ExpectedOutcome(validity, repetitions, minimum_quality)


def _completed(repetitions: int, quality: float = 0.9) -> DetectedOutcome:
    return DetectedOutcome(ProcessingStatus.COMPLETED, repetitions, quality)


def _rejected(category: FailureCategory | None = None) -> DetectedOutcome:
    return DetectedOutcome(ProcessingStatus.REJECTED, failure_category=category)


def _direct_case(
    *,
    case_id: str = "case-001",
    source_type: SourceType = SourceType.REAL,
    generation: GenerationProvenance | None = None,
) -> ValidationCase:
    return ValidationCase(
        case_id=case_id,
        video_path="../videos/case-001.mp4",
        video_sha256=VIDEO_SHA256,
        source_type=source_type,
        expected=_expected(),
        subject=SubjectAnnotation(age=70, sex=Sex.FEMALE, height_cm=160.0),
        timing=TimingAnnotation(0.0, 3.0, 3.0, 33.0),
        view=ViewMetadata("side", "full_body", "normal", "none"),
        generation=generation,
    )


def _provenance() -> GenerationProvenance:
    return GenerationProvenance("SynthDA", "1.0", "run-001", "42", CONFIG_SHA256)


def test_actual_template_loads() -> None:
    manifest = load_manifest(TEMPLATE_PATH)

    assert manifest.dataset_id == "chair-stand-validation-template-v1"
    assert [case.source_type for case in manifest.cases] == [
        SourceType.REAL,
        SourceType.SYNTHDA,
    ]
    assert manifest.cases[0].generation is None
    assert manifest.cases[1].generation is not None


def test_loads_valid_manifest_and_normalises_video_hash(tmp_path: Path) -> None:
    manifest = load_manifest(_write_manifest(tmp_path, _valid_payload()))
    case = manifest.cases[0]

    assert manifest.schema_version == 1
    assert case.video_path == "../../local_validation_videos/case-001.mp4"
    assert case.video_sha256 == VIDEO_SHA256
    assert case.expected.validity is ExpectedValidity.VALID_MOVEMENT


def test_portable_video_path_resolves_from_manifest_parent_without_mutation(
    tmp_path: Path,
) -> None:
    manifest_path = _write_manifest(tmp_path, _valid_payload())
    case = load_manifest(manifest_path).cases[0]
    stored_path = case.video_path

    assert case.resolve_video_path(manifest_path) == (
        manifest_path.parent / "../../local_validation_videos/case-001.mp4"
    ).resolve()
    assert case.video_path == stored_path
    assert case.to_dict()["video_path"] == stored_path


def test_manifest_hash_uses_stored_portable_path(tmp_path: Path) -> None:
    manifest_path = _write_manifest(tmp_path, _valid_payload())
    manifest = load_manifest(manifest_path)
    canonical_payload = _valid_payload()
    canonical_payload["cases"][0]["video_sha256"] = VIDEO_SHA256

    assert sha256_json(manifest.to_dict()) == sha256_json(canonical_payload)
    assert str(manifest.cases[0].resolve_video_path(manifest_path)) not in json.dumps(
        manifest.to_dict()
    )


def test_rejects_empty_absolute_windows_and_uri_video_paths(tmp_path: Path) -> None:
    for video_path in ("", "/absolute/video.mp4", r"C:\video.mp4", "https://x/video.mp4"):
        payload = _valid_payload()
        payload["cases"][0]["video_path"] = video_path
        with pytest.raises(ManifestValidationError, match=r"case 'case-001'.*video_path"):
            load_manifest(_write_manifest(tmp_path / str(len(video_path)), payload))


def test_rejects_unsupported_schema_version(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["schema_version"] = 2

    with pytest.raises(ManifestValidationError, match=r"manifest\.schema_version.*expected 1"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_rejects_duplicate_case_ids_from_payload(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"].append(deepcopy(payload["cases"][0]))

    with pytest.raises(ManifestValidationError, match=r"case 'case-001'\.case_id is duplicated"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_direct_manifest_construction_rejects_duplicate_case_ids() -> None:
    case = _direct_case()

    with pytest.raises(ValueError, match=r"case 'case-001'\.case_id is duplicated"):
        ValidationManifest(1, "duplicate-test", (case, case))


def test_whitespace_padded_case_id_is_rejected_by_parser_and_constructor(
    tmp_path: Path,
) -> None:
    payload = _valid_payload()
    payload["cases"][0]["case_id"] = " case-001 "

    with pytest.raises(
        ManifestValidationError,
        match=r"case_id must not contain leading or trailing whitespace",
    ):
        load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(
        ValueError,
        match=r"case_id must not contain leading or trailing whitespace",
    ):
        _direct_case(case_id="case-001 ")


def test_whitespace_padded_dataset_id_is_rejected_by_parser_and_constructor(
    tmp_path: Path,
) -> None:
    payload = _valid_payload()
    payload["dataset_id"] = " chair-stand-test"

    with pytest.raises(
        ManifestValidationError,
        match=r"manifest\.dataset_id must not contain leading or trailing whitespace",
    ):
        load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(
        ValueError,
        match=r"manifest\.dataset_id must not contain leading or trailing whitespace",
    ):
        ValidationManifest(1, "chair-stand-test ", (_direct_case(),))


@pytest.mark.parametrize("field", ["tool", "version", "run_id"])
def test_whitespace_padded_generation_identity_is_rejected_by_parser_and_constructor(
    tmp_path: Path,
    field: str,
) -> None:
    values = {
        "tool": "SynthDA",
        "version": "1.0",
        "run_id": "run-001",
        "seed": "42",
        "config_sha256": CONFIG_SHA256,
    }
    values[field] = f" {values[field]} "
    payload = _valid_payload()
    payload["cases"][0]["source_type"] = "synthda"
    payload["cases"][0]["generation"] = values

    with pytest.raises(
        ManifestValidationError,
        match=rf"generation\.{field} must not contain leading or trailing whitespace",
    ):
        load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(
        ValueError,
        match=rf"generation\.{field} must not contain leading or trailing whitespace",
    ):
        GenerationProvenance(**values)


def test_padded_identifier_cannot_bypass_duplicate_detection(tmp_path: Path) -> None:
    payload = _valid_payload()
    padded_case = deepcopy(payload["cases"][0])
    padded_case["case_id"] = " case-001"
    payload["cases"].append(padded_case)

    with pytest.raises(
        ManifestValidationError,
        match=r"case_id must not contain leading or trailing whitespace",
    ):
        load_manifest(_write_manifest(tmp_path, payload))


def test_rejects_invalid_validity_label(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"][0]["expected"]["validity"] = "maybe"

    with pytest.raises(ManifestValidationError, match=r"expected\.validity: invalid value 'maybe'"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_rejects_negative_repetitions_from_parser_and_constructor(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"][0]["expected"]["repetitions"] = -1

    with pytest.raises(ManifestValidationError, match=r"expected\.repetitions.*non-negative"):
        load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(ValueError, match=r"expected\.repetitions.*non-negative"):
        ExpectedOutcome(ExpectedValidity.VALID_MOVEMENT, -1)


def test_timing_equality_boundary_is_allowed() -> None:
    timing = TimingAnnotation(0.0, 3.0, 3.0, 33.0)

    assert timing.calibration_end_s == timing.test_start_s


def test_timing_zero_length_intervals_are_rejected() -> None:
    with pytest.raises(ValueError, match="timing must satisfy"):
        TimingAnnotation(0.0, 0.0, 1.0, 2.0)
    with pytest.raises(ValueError, match="timing must satisfy"):
        TimingAnnotation(0.0, 1.0, 2.0, 2.0)


def test_parser_rejects_invalid_timing_order(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"][0]["timing"]["test_start_s"] = 2.0

    with pytest.raises(ManifestValidationError, match=r"case 'case-001'\.timing must satisfy"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_synthda_requires_generation_provenance(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"][0]["source_type"] = "synthda"

    with pytest.raises(ManifestValidationError, match=r"case 'case-001'\.generation is required"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_real_source_forbids_generation_provenance(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"][0]["generation"] = _provenance().to_dict()

    with pytest.raises(ManifestValidationError, match=r"case 'case-001'\.generation must be omitted"):
        load_manifest(_write_manifest(tmp_path, payload))


def test_direct_construction_enforces_source_provenance_compatibility() -> None:
    with pytest.raises(ValueError, match="generation is required"):
        _direct_case(source_type=SourceType.SYNTHDA)
    with pytest.raises(ValueError, match="generation must be omitted"):
        _direct_case(generation=_provenance())


def test_video_and_config_hashes_are_distinct_and_validated(tmp_path: Path) -> None:
    payload = _valid_payload()
    payload["cases"][0]["video_sha256"] = "not-a-sha"

    with pytest.raises(ManifestValidationError, match=r"video_sha256.*64-character hexadecimal"):
        load_manifest(_write_manifest(tmp_path, payload))
    with pytest.raises(ValueError, match=r"generation\.config_sha256.*64-character"):
        GenerationProvenance("SynthDA", "1.0", "run", "1", "bad")


def test_non_finite_values_are_rejected() -> None:
    for value in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(ValueError, match="finite"):
            ExpectedOutcome(ExpectedValidity.VALID_MOVEMENT, 5, value)
        with pytest.raises(ValueError, match="finite"):
            DetectedOutcome(ProcessingStatus.COMPLETED, 5, value)
        with pytest.raises(ValueError, match="finite"):
            TimingAnnotation(0.0, 3.0, 3.0, value)
        with pytest.raises(ValueError, match="finite JSON-compatible"):
            sha256_json({"value": value})


def test_known_sha256_file_vector(tmp_path: Path) -> None:
    file_path = tmp_path / "abc.bin"
    file_path.write_bytes(b"abc")

    assert sha256_file(file_path) == (
        "ba7816bf8f01cfea414140de5dae2223"
        "b00361a396177a9cb410ff61f20015ad"
    )


def test_unicode_json_hash_uses_canonical_utf8() -> None:
    canonical = '{"text":"\u4f60\u597d"}'.encode("utf-8")

    assert sha256_json({"text": "\u4f60\u597d"}) == hashlib.sha256(canonical).hexdigest()
    assert sha256_json({"b": 2, "a": 1}) == sha256_json({"a": 1, "b": 2})


def test_changed_json_payload_changes_hash() -> None:
    assert sha256_json({"repetitions": 5}) != sha256_json({"repetitions": 6})


def test_valid_movement_decision_table() -> None:
    expected = _expected()

    exact = compare_outcomes(expected, _completed(5))
    under = compare_outcomes(expected, _completed(3))
    over = compare_outcomes(expected, _completed(7))
    rejected = compare_outcomes(expected, _rejected())

    assert (exact.passed, exact.rep_error, exact.failure_category) == (True, 0, None)
    assert (under.rep_error, under.failure_category) == (-2, FailureCategory.REP_UNDER_COUNT)
    assert (over.rep_error, over.failure_category) == (2, FailureCategory.REP_OVER_COUNT)
    assert rejected.failure_category is FailureCategory.UNEXPECTED_REJECTION


def test_invalid_movement_zero_exact_under_over_and_rejection_semantics() -> None:
    zero_expected = _expected(ExpectedValidity.INVALID_MOVEMENT, repetitions=0)
    one_expected = _expected(ExpectedValidity.INVALID_MOVEMENT, repetitions=1)

    assert compare_outcomes(zero_expected, _completed(0)).passed is True
    assert compare_outcomes(one_expected, _completed(0)).failure_category is FailureCategory.REP_UNDER_COUNT
    assert compare_outcomes(one_expected, _completed(2)).failure_category is FailureCategory.REP_OVER_COUNT
    assert compare_outcomes(zero_expected, _rejected()).failure_category is FailureCategory.UNEXPECTED_REJECTION


def test_invalid_input_rejected_passes_but_completion_is_unexpected_acceptance() -> None:
    expected = _expected(ExpectedValidity.INVALID_INPUT, repetitions=0)

    correctly_rejected = compare_outcomes(expected, _rejected(FailureCategory.POSE_MISSING))
    unexpectedly_completed = compare_outcomes(expected, _completed(0))

    assert correctly_rejected.passed is True
    assert correctly_rejected.failure_category is None
    assert unexpectedly_completed.passed is False
    assert unexpectedly_completed.failure_category is FailureCategory.UNEXPECTED_ACCEPTANCE


def test_runtime_error_has_precedence_for_invalid_input() -> None:
    result = compare_outcomes(
        _expected(ExpectedValidity.INVALID_INPUT, repetitions=0),
        _rejected(FailureCategory.RUNTIME_ERROR),
    )

    assert result.passed is False
    assert result.failure_category is FailureCategory.RUNTIME_ERROR


def test_invalid_input_pass_retains_pose_missing_in_json_and_csv() -> None:
    case_result = CaseResult.from_outcomes(
        "case-001",
        _expected(ExpectedValidity.INVALID_INPUT, repetitions=0),
        _rejected(FailureCategory.POSE_MISSING),
    )

    assert case_result.comparison.passed is True
    assert case_result.comparison.failure_category is None
    assert case_result.to_dict()["failure_category"] is None
    assert case_result.to_dict()["runtime_failure_category"] == "pose_missing"
    assert case_result.to_csv_row()["runtime_failure_category"] == "pose_missing"


def test_second_runtime_rejection_category_serialises_without_conflation() -> None:
    case_result = CaseResult.from_outcomes(
        "case-001",
        _expected(ExpectedValidity.INVALID_INPUT, repetitions=0),
        _rejected(FailureCategory.VIDEO_UNREADABLE),
    )

    assert case_result.comparison.passed is True
    assert case_result.to_dict()["failure_category"] is None
    assert case_result.to_dict()["runtime_failure_category"] == "video_unreadable"


def test_processable_pose_missing_failure_retains_both_categories() -> None:
    case_result = CaseResult.from_outcomes(
        "case-001",
        _expected(),
        _rejected(FailureCategory.POSE_MISSING),
    )

    assert case_result.comparison.passed is False
    assert case_result.comparison.failure_category is FailureCategory.POSE_MISSING
    assert case_result.to_dict()["failure_category"] == "pose_missing"
    assert case_result.to_dict()["runtime_failure_category"] == "pose_missing"


def test_runtime_rejection_categories_are_preserved_for_processable_input() -> None:
    expected = _expected()

    for category in (
        FailureCategory.POSE_MISSING,
        FailureCategory.INSUFFICIENT_TEST_SIGNAL,
        FailureCategory.LOW_POSE_COVERAGE,
    ):
        result = compare_outcomes(expected, _rejected(category))
        assert result.passed is False
        assert result.failure_category is category


def test_calibration_quality_exact_threshold_passes() -> None:
    result = compare_outcomes(_expected(minimum_quality=0.5), _completed(5, quality=0.5))

    assert result.passed is True
    assert result.failure_category is None


def test_calibration_quality_below_threshold_fails() -> None:
    result = compare_outcomes(_expected(minimum_quality=0.5), _completed(5, quality=0.49))

    assert result.rep_error == 0
    assert result.failure_category is FailureCategory.CALIBRATION_QUALITY_LOW


def test_detected_comparison_and_case_result_serialise_as_stable_strings() -> None:
    expected = _expected()
    detected = _completed(3)
    result = CaseResult.from_outcomes("case-001", expected, detected)

    assert detected.to_dict() == {
        "processing_status": "completed",
        "detected_repetitions": 3,
        "calibration_quality": 0.9,
        "runtime_failure_category": None,
    }
    assert result.comparison.to_dict()["failure_category"] == "rep_under_count"
    assert result.to_dict()["expected_validity"] == "valid_movement"
    json.dumps(result.to_dict(), allow_nan=False)


def test_manifest_json_round_trip_preserves_enum_and_portable_path() -> None:
    manifest = manifest_from_payload(_valid_payload())
    encoded = json.dumps(manifest.to_dict(), ensure_ascii=False, allow_nan=False)
    round_tripped = manifest_from_payload(json.loads(encoded))

    assert round_tripped == manifest
    assert round_tripped.cases[0].to_dict()["source_type"] == "real"
    assert round_tripped.cases[0].to_dict()["video_path"] == (
        "../../local_validation_videos/case-001.mp4"
    )


def test_case_result_json_and_csv_fields_agree() -> None:
    result = CaseResult.from_outcomes("case-001", _expected(), _completed(7, 0.75))
    json_row = result.to_dict()
    csv_row = result.to_csv_row()
    agreed_fields = {
        "case_id",
        "processing_status",
        "expected_repetitions",
        "detected_repetitions",
        "rep_error",
        "absolute_rep_error",
        "passed",
        "failure_category",
        "runtime_failure_category",
        "calibration_quality",
    }

    assert json_row == csv_row
    assert agreed_fields <= json_row.keys()
    assert {name: json_row[name] for name in agreed_fields} == {
        name: csv_row[name] for name in agreed_fields
    }

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(csv_row))
    writer.writeheader()
    writer.writerow(csv_row)
    assert "case-001" in output.getvalue()
