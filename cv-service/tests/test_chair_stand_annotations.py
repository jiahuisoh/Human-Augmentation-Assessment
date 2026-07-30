"""Security-focused tests for pure JSON chair-stand annotation utilities."""

from __future__ import annotations

import ast
import hashlib
import json
import os
import stat
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

import pytest

import validation.chair_stand.generate_annotation_pack as generator_module
from validation.chair_stand.generate_annotation_pack import (
    AnnotationDataError,
    assert_sources_unchanged,
    build_annotation_records,
    generate_annotation_pack,
    load_and_validate_sources,
    main as generator_main,
)
from validation.chair_stand.validate_annotations import (
    main as validator_main,
    validate_annotations,
)


CASE_IDS = (
    "cs-real-clean-004",
    "cs-real-angle30-005",
    "cs-real-ankles-cropped-006",
    "cs-real-incomplete-007",
    "cs-real-calibration-motion-008",
)
CONDITIONS = {
    "cs-real-clean-004": "clean_side_view",
    "cs-real-angle30-005": "camera_angle_30_degrees",
    "cs-real-ankles-cropped-006": "ankles_and_feet_cropped",
    "cs-real-incomplete-007": "incomplete_movement",
    "cs-real-calibration-motion-008": "calibration_motion",
}
VALIDITIES = {
    case_id: (
        "invalid_movement" if case_id == "cs-real-incomplete-007" else "valid_movement"
    )
    for case_id in CASE_IDS
}


@dataclass(frozen=True)
class Sources:
    inventory: Path
    provenance: Path
    specification: Path


def _dump(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _replace_text_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    assert text.count(old) >= 1
    path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")


def _source_payloads() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    inventory = {
        "schema_version": 1,
        "session_id": "session-pseudo-02c",
        "subject_id": "subject-pseudo-017",
        "cases": [
            {
                "case_id": case_id,
                "video_filename": f"{case_id}.mp4",
                "video_sha256": f"{index:x}" * 64,
                "inventory_metadata": {
                    "fps": 10.0,
                    "frame_count": 500,
                    "duration_s": 49.912345678901,
                    "file_size_bytes": 1000 + index,
                    "width_px": 641 + index,
                    "height_px": 481 + index,
                    "capture_note": "café metadata",
                },
            }
            for index, case_id in enumerate(CASE_IDS, start=1)
        ],
    }
    provenance = {
        "schema_version": 1,
        "provenance_revision": 2,
        "supersedes_filename": "chair-stand-session-provenance-v1.json",
        "declared_direct_identifiers": [],
        "inventory_filename": "inventory.json",
        "inventory_sha256": "",
        "session_id": inventory["session_id"],
        "subject_id": inventory["subject_id"],
        "case_ids": list(CASE_IDS),
    }
    specification = {
        "schema_version": 1,
        "inventory_filename": "inventory.json",
        "inventory_sha256": "",
        "session_provenance_filename": "session-provenance-v2.json",
        "session_provenance_sha256": "",
        "session_id": inventory["session_id"],
        "subject_id": inventory["subject_id"],
        "cases": [
            {
                "case_id": case_id,
                "primary_condition": CONDITIONS[case_id],
                "control_case_id": None if index == 0 else CASE_IDS[0],
                "planned_condition_measurement": {
                    "label": CONDITIONS[case_id], "ordinal": index
                },
                "provisional_validity": VALIDITIES[case_id],
                "planned_timing": {
                    "calibration_start_s": 0.0,
                    "calibration_end_s": 3.0,
                    "active_start_s": 5.0,
                    "active_end_s": 15.0,
                },
                "planned_frame_boundaries": {
                    "calibration_start_frame": 0,
                    "calibration_end_frame": 30,
                    "active_start_frame": 50,
                    "active_end_frame": 150,
                },
                "human_question_ids": [
                    f"{case_id}.condition",
                    f"{case_id}.repetitions",
                ],
            }
            for index, case_id in enumerate(CASE_IDS)
        ],
    }
    return inventory, provenance, specification


def _write_sources(tmp_path: Path) -> Sources:
    source_directory = tmp_path / "sources"
    source_directory.mkdir(parents=True)
    paths = Sources(
        source_directory / "inventory.json",
        source_directory / "session-provenance-v2.json",
        source_directory / "case-specification.json",
    )
    inventory, provenance, specification = _source_payloads()
    _dump(paths.inventory, inventory)
    provenance["inventory_sha256"] = _digest(paths.inventory)
    _dump(paths.provenance, provenance)
    specification["inventory_sha256"] = _digest(paths.inventory)
    specification["session_provenance_sha256"] = _digest(paths.provenance)
    _dump(paths.specification, specification)
    return paths


def _read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _rewrite(
    sources: Sources,
    which: str,
    change: Callable[[dict[str, Any]], None],
) -> None:
    target = getattr(sources, which)
    payload = _read(target)
    change(payload)
    _dump(target, payload)
    if which == "inventory":
        provenance = _read(sources.provenance)
        provenance["inventory_sha256"] = _digest(sources.inventory)
        _dump(sources.provenance, provenance)
        specification = _read(sources.specification)
        specification["inventory_sha256"] = _digest(sources.inventory)
        specification["session_provenance_sha256"] = _digest(sources.provenance)
        _dump(sources.specification, specification)
    elif which == "provenance":
        specification = _read(sources.specification)
        specification["session_provenance_sha256"] = _digest(sources.provenance)
        _dump(sources.specification, specification)


def _generate(tmp_path: Path) -> tuple[Sources, Path]:
    sources = _write_sources(tmp_path)
    pack = generate_annotation_pack(
        sources.inventory,
        sources.provenance,
        sources.specification,
        tmp_path / "output",
    )
    return sources, pack


def _annotation_paths(pack: Path) -> dict[str, Path]:
    return {
        path.name.removesuffix(".annotation.json"): path
        for path in pack.glob("*.annotation.json")
    }


def _annotation_records(pack: Path) -> dict[str, dict[str, Any]]:
    return {case_id: _read(path) for case_id, path in _annotation_paths(pack).items()}


def _complete_record(record: dict[str, Any], *, reject: bool = False) -> None:
    case_id = record["case_id"]
    record["actual_condition_observed"] = record["primary_condition"]
    record["final_expected_validity"] = VALIDITIES[case_id]
    record["completed_repetitions"] = 0 if case_id == "cs-real-incomplete-007" else 2
    record["complete_repetition_intervals"] = (
        []
        if case_id == "cs-real-incomplete-007"
        else [{"start_s": 6.0, "end_s": 6.8}, {"start_s": 8.0, "end_s": 8.8}]
    )
    record["incomplete_or_non_repetition_intervals"] = (
        [{"start_s": 6.0, "end_s": 6.8}]
        if case_id == "cs-real-incomplete-007"
        else []
    )
    record["visibility_observations"] = {}
    record["protocol_observations"] = {}
    if case_id == "cs-real-clean-004":
        record["visibility_observations"] = {
            "whole_body": "visible",
            "chair": "visible",
        }
        record["protocol_observations"] = {
            "clean_side_view_observed": True,
            "protocol_adherence": True,
        }
    elif case_id == "cs-real-angle30-005":
        record["visibility_observations"] = {"body": "visible"}
        record["protocol_observations"] = {
            "intended_angle_confirmed": True,
            "distance_and_framing_comparable": True,
            "camera_angle_only_material_change": True,
        }
    elif case_id == "cs-real-ankles-cropped-006":
        record["visibility_observations"] = {
            "ankles": "not_visible_by_design",
            "feet": "not_visible_by_design",
            "hips": "visible",
            "knees": "visible",
            "chair": "visible",
        }
        record["protocol_observations"] = {
            "crop_stable": True,
            "physical_repetition_complete": True,
        }
    elif case_id == "cs-real-incomplete-007":
        record["protocol_observations"] = {
            "partial_attempts_documented": True,
            "complete_upright_repetition_observed": False,
        }
    else:
        record["protocol_observations"] = {
            "returned_upright_before_calibration_end": True,
        }
    calibration_case = case_id == "cs-real-calibration-motion-008"
    record["calibration_motion_observed"] = calibration_case
    record["calibration_motion_interval"] = (
        {"start_s": 0.5, "end_s": 1.0} if calibration_case else None
    )
    record["confounders"] = []
    record["cutoff_handling"] = "All intervals were reviewed against the active cutoff."
    record["ground_truth_rationale"] = "Two blinded human readings of the source clip."
    record["primary_annotation"] = {
        "annotator_id": "reviewer-primary",
        "completed": True,
        "blinding_attestation": True,
    }
    record["second_review"] = {
        "reviewer_id": "reviewer-second",
        "completed": True,
        "reviewed_completed_repetitions": record["completed_repetitions"],
        "reviewed_final_expected_validity": record["final_expected_validity"],
        "blinding_attestation": True,
    }
    record["adjudication"] = {
        "resolved": True if calibration_case else False,
        "adjudicator_id": "reviewer-adjudicator" if calibration_case else None,
        "completed_repetitions": record["completed_repetitions"] if calibration_case else None,
        "final_expected_validity": record["final_expected_validity"] if calibration_case else None,
        "rationale": "Independent calibration-motion adjudication." if calibration_case else None,
    }
    record["decision"] = {
        "include_or_reject": "reject" if reject else "include",
        "rejection_reason": "Protocol departure after complete review." if reject else None,
    }


def _complete_pack(pack: Path) -> None:
    for path in _annotation_paths(pack).values():
        record = _read(path)
        _complete_record(record)
        _dump(path, record)


def _validate(sources: Sources, pack: Path, report: Path | None = None) -> dict[str, Any]:
    return validate_annotations(
        sources.inventory,
        sources.provenance,
        sources.specification,
        pack,
        report,
    )


def test_generation_is_deterministic_and_uses_source_case_order(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"].reverse(),
    )
    bundle = load_and_validate_sources(
        sources.inventory, sources.provenance, sources.specification
    )
    assert [record["case_id"] for record in build_annotation_records(bundle)] == list(
        reversed(CASE_IDS)
    )

    first = generate_annotation_pack(
        sources.inventory, sources.provenance, sources.specification, tmp_path / "one"
    )
    second = generate_annotation_pack(
        sources.inventory, sources.provenance, sources.specification, tmp_path / "two"
    )
    assert first.name == second.name
    assert {
        path.name: path.read_bytes() for path in first.iterdir()
    } == {path.name: path.read_bytes() for path in second.iterdir()}


def test_inventory_values_and_recomputed_hash_are_copied_exactly(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    inventory = _read(sources.inventory)
    records = _annotation_records(pack)
    for inventory_case in inventory["cases"]:
        record = records[inventory_case["case_id"]]
        assert record["inventory_metadata"] == inventory_case["inventory_metadata"]
        assert record["video_sha256"] == inventory_case["video_sha256"]
        assert record["sources"]["inventory"]["sha256"] == _digest(sources.inventory)


def test_provenance_v2_lineage_is_preserved(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    record = next(iter(_annotation_records(pack).values()))
    reference = record["sources"]["session_provenance"]
    assert reference == {
        "filename": sources.provenance.name,
        "provenance_revision": 2,
        "sha256": _digest(sources.provenance),
    }


def test_revision_one_provenance_is_rejected(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(sources, "provenance", lambda payload: payload.update(provenance_revision=1))
    with pytest.raises(AnnotationDataError, match="revision 2"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_declared_direct_identifier_is_rejected(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "provenance",
        lambda payload: payload["declared_direct_identifiers"].append("name"),
    )
    with pytest.raises(AnnotationDataError, match="no direct identifiers"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


@pytest.mark.parametrize("digest", ["a" * 63, "A" * 64, "g" * 64])
def test_malformed_sha256_is_rejected(tmp_path: Path, digest: str) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "inventory",
        lambda payload: payload["cases"][0].update(video_sha256=digest),
    )
    with pytest.raises(AnnotationDataError, match="64 lowercase"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_referenced_inventory_hash_mismatch_is_rejected(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "provenance",
        lambda payload: payload.update(inventory_sha256="f" * 64),
    )
    with pytest.raises(AnnotationDataError, match="does not match"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


@pytest.mark.parametrize("problem", ["duplicate", "missing"])
def test_duplicate_and_missing_source_case_ids_are_rejected(
    tmp_path: Path, problem: str
) -> None:
    sources = _write_sources(tmp_path)
    if problem == "duplicate":
        _rewrite(
            sources,
            "inventory",
            lambda payload: payload["cases"].append(deepcopy(payload["cases"][0])),
        )
        match = "duplicate"
    else:
        _rewrite(
            sources,
            "specification",
            lambda payload: payload["cases"].pop(),
        )
        match = "unique and complete"
    with pytest.raises(AnnotationDataError, match=match):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


@pytest.mark.parametrize(
    "problem", ["unknown", "chain-unknown", "self", "cycle", "two-baselines"]
)
def test_invalid_control_topology_is_rejected(tmp_path: Path, problem: str) -> None:
    sources = _write_sources(tmp_path)

    def change(payload: dict[str, Any]) -> None:
        if problem == "unknown":
            payload["cases"][1]["control_case_id"] = "missing-control"
        elif problem == "chain-unknown":
            payload["cases"][1]["control_case_id"] = payload["cases"][2]["case_id"]
            payload["cases"][2]["control_case_id"] = "missing-control"
        elif problem == "self":
            payload["cases"][1]["control_case_id"] = payload["cases"][1]["case_id"]
        elif problem == "cycle":
            payload["cases"][0]["control_case_id"] = payload["cases"][1]["case_id"]
        else:
            payload["cases"][1]["control_case_id"] = None

    _rewrite(sources, "specification", change)
    with pytest.raises(AnnotationDataError, match="control|baseline"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_baseline_control_case_id_must_not_be_omitted(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][0].pop("control_case_id"),
    )
    with pytest.raises(
        AnnotationDataError,
        match=rf"{CASE_IDS[0]}\.control_case_id is required",
    ):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_baseline_control_case_id_null_remains_valid(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    bundle = load_and_validate_sources(
        sources.inventory, sources.provenance, sources.specification
    )
    assert bundle.specification_cases[0]["control_case_id"] is None


def test_non_baseline_control_case_id_must_not_be_omitted(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][1].pop("control_case_id"),
    )
    with pytest.raises(
        AnnotationDataError,
        match=rf"{CASE_IDS[1]}\.control_case_id is required",
    ):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_non_baseline_control_case_id_null_remains_invalid(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][1].update(control_case_id=None),
    )
    with pytest.raises(AnnotationDataError, match="exactly one baseline"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_valid_non_baseline_control_reference_remains_valid(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    bundle = load_and_validate_sources(
        sources.inventory, sources.provenance, sources.specification
    )
    assert bundle.specification_cases[1]["control_case_id"] == CASE_IDS[0]


def test_invalid_timing_is_rejected(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][0]["planned_timing"].update(
            active_start_s=2.0
        ),
    )
    with pytest.raises(AnnotationDataError, match="calibration_start"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_inconsistent_frame_boundaries_are_rejected(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][0]["planned_frame_boundaries"].update(
            active_start_frame=51
        ),
    )
    with pytest.raises(AnnotationDataError, match="do not match timing and FPS"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_overflow_number_at_top_level_is_rejected_without_output(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _replace_text_once(
        sources.inventory, '"schema_version": 1', '"schema_version": 1e999'
    )
    output = tmp_path / "output"
    with pytest.raises(
        AnnotationDataError, match=r"inventory\.schema_version.*non-finite"
    ):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


def test_overflow_number_in_nested_metadata_is_rejected_without_output(
    tmp_path: Path,
) -> None:
    sources = _write_sources(tmp_path)
    _replace_text_once(
        sources.inventory,
        '"duration_s": 49.912345678901',
        '"duration_s": 1e999',
    )
    output = tmp_path / "output"
    with pytest.raises(
        AnnotationDataError,
        match=r"inventory\.cases\[0\]\.inventory_metadata\.duration_s.*non-finite",
    ):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


@pytest.mark.parametrize("field", ["fps", "frame_count"])
def test_extremely_large_integer_metadata_is_rejected_without_output(
    tmp_path: Path, field: str
) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "inventory",
        lambda payload: payload["cases"][0]["inventory_metadata"].update(
            {field: 10**100}
        ),
    )
    output = tmp_path / "output"
    with pytest.raises(
        AnnotationDataError,
        match=rf"inventory\.cases\[0\]\.inventory_metadata\.{field}.*range",
    ):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


def test_unparseably_large_integer_fps_retains_its_logical_path(
    tmp_path: Path,
) -> None:
    sources = _write_sources(tmp_path)
    _replace_text_once(
        sources.inventory,
        '"fps": 10.0',
        '"fps": ' + "9" * 5000,
    )
    output = tmp_path / "output"
    with pytest.raises(
        AnnotationDataError,
        match=r"inventory\.cases\[0\]\.inventory_metadata\.fps.*range",
    ):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


def test_extreme_finite_timing_is_rejected_without_output(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][0]["planned_timing"].update(
            active_end_s=1e308
        ),
    )
    output = tmp_path / "output"
    with pytest.raises(
        AnnotationDataError,
        match=(
            r"case specification\.cases\[0\]\.planned_timing\.active_end_s.*range"
        ),
    ):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


def test_unrepresentable_frame_arithmetic_is_rejected_without_output(
    tmp_path: Path,
) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "inventory",
        lambda payload: payload["cases"][0]["inventory_metadata"].update(
            fps=1_000_000_000
        ),
    )
    _rewrite(
        sources,
        "specification",
        lambda payload: payload["cases"][0]["planned_timing"].update(
            active_end_s=10_000_000
        ),
    )
    output = tmp_path / "output"
    with pytest.raises(
        AnnotationDataError,
        match=(
            rf"{CASE_IDS[0]}\.planned_frame_boundaries\.active_end_frame"
            r".*unrepresentable"
        ),
    ):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


def test_extreme_integer_cli_failure_is_controlled_without_traceback(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "inventory",
        lambda payload: payload["cases"][0]["inventory_metadata"].update(
            fps=10**100
        ),
    )
    output = tmp_path / "output"
    result = generator_main(
        [
            "--inventory",
            str(sources.inventory),
            "--session-provenance",
            str(sources.provenance),
            "--case-specification",
            str(sources.specification),
            "--output-directory",
            str(output),
        ]
    )
    captured = capsys.readouterr()
    assert result == 2
    assert "inventory.cases[0].inventory_metadata.fps" in captured.err
    assert "Traceback" not in captured.err
    assert not output.exists()


def test_ordinary_numeric_values_are_preserved_and_pass(tmp_path: Path) -> None:
    _, pack = _generate(tmp_path)
    record = _annotation_records(pack)[CASE_IDS[0]]
    assert record["inventory_metadata"]["fps"] == 10.0
    assert record["inventory_metadata"]["frame_count"] == 500
    assert record["planned_timing"]["active_end_s"] == 15.0
    assert record["planned_frame_boundaries"]["active_end_frame"] == 150


def test_source_hash_and_payload_use_the_same_immutable_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sources = _write_sources(tmp_path)
    original = sources.inventory.read_bytes()
    changed_payload = _read(sources.inventory)
    changed_payload["subject_id"] = "subject-pseudo-changed"
    changed = (
        json.dumps(changed_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    real_loads = json.loads
    changed_during_parse = False

    def loads_then_change_source(text: str, *args: Any, **kwargs: Any) -> Any:
        nonlocal changed_during_parse
        if not changed_during_parse and '"video_filename"' in text:
            sources.inventory.write_bytes(changed)
            changed_during_parse = True
        return real_loads(text, *args, **kwargs)

    monkeypatch.setattr(
        generator_module,
        "json",
        SimpleNamespace(
            loads=loads_then_change_source,
            dump=json.dump,
            JSONDecodeError=json.JSONDecodeError,
        ),
    )
    bundle = load_and_validate_sources(
        sources.inventory, sources.provenance, sources.specification
    )
    assert changed_during_parse
    assert bundle.inventory.payload["subject_id"] == "subject-pseudo-017"
    assert bundle.inventory.sha256 == hashlib.sha256(original).hexdigest()
    with pytest.raises(AnnotationDataError, match="changed after validation"):
        assert_sources_unchanged(bundle)


def test_generated_json_is_utf8_without_bom(tmp_path: Path) -> None:
    _, pack = _generate(tmp_path)
    for path in pack.iterdir():
        raw = path.read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf")
        assert "café" in raw.decode("utf-8")


def test_generation_refuses_overwrite(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    output = tmp_path / "output"
    pack = generate_annotation_pack(
        sources.inventory, sources.provenance, sources.specification, output
    )
    before = {path.name: path.read_bytes() for path in pack.iterdir()}
    with pytest.raises(FileExistsError, match="already exists"):
        generate_annotation_pack(
            sources.inventory, sources.provenance, sources.specification, output
        )
    assert {path.name: path.read_bytes() for path in pack.iterdir()} == before


def test_repository_contained_output_is_rejected_without_writing(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    forbidden = Path(__file__).parents[1] / "forbidden-annotation-output"
    assert not forbidden.exists()
    with pytest.raises(AnnotationDataError, match="outside the repository"):
        generate_annotation_pack(
            sources.inventory, sources.provenance, sources.specification, forbidden
        )
    assert not forbidden.exists()


def test_output_path_traversal_is_rejected(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    with pytest.raises(AnnotationDataError, match="path traversal"):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            tmp_path / "allowed" / ".." / "escape",
        )


def test_symlink_source_input_is_rejected_when_supported(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    linked_inventory = sources.inventory.parent / "linked-inventory.json"
    try:
        linked_inventory.symlink_to(sources.inventory)
    except OSError as exc:
        pytest.skip(f"file symlinks are unavailable: {exc}")
    output = tmp_path / "output"
    with pytest.raises(AnnotationDataError, match="symbolic link|reparse point"):
        generate_annotation_pack(
            linked_inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert not output.exists()


def test_symlink_output_escape_is_rejected_when_supported(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "linked-output"
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"directory symlinks are unavailable: {exc}")
    with pytest.raises(AnnotationDataError, match="symbolic link"):
        generate_annotation_pack(
            sources.inventory, sources.provenance, sources.specification, link
        )


def test_mocked_windows_reparse_attribute_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sources = _write_sources(tmp_path)
    source_parent = generator_module._absolute_path(sources.inventory.parent)
    real_lstat = generator_module._path_lstat
    reparse_attribute = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)

    def lstat_with_reparse(path: Path) -> Any:
        result = real_lstat(path)
        if generator_module._absolute_path(path) == source_parent:
            return SimpleNamespace(
                st_mode=result.st_mode,
                st_file_attributes=reparse_attribute,
            )
        return result

    monkeypatch.setattr(generator_module, "_path_lstat", lstat_with_reparse)
    with pytest.raises(AnnotationDataError, match="junction|reparse point"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_new_pack_is_removed_after_injected_write_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sources = _write_sources(tmp_path)
    output = tmp_path / "output"
    real_write = generator_module._write_json_exclusive
    call_count = 0

    def fail_second_write(
        path: Path,
        payload: dict[str, Any],
        *,
        approved_parent: Path | None = None,
    ) -> None:
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise OSError("injected write failure")
        real_write(path, payload, approved_parent=approved_parent)

    monkeypatch.setattr(generator_module, "_write_json_exclusive", fail_second_write)
    with pytest.raises(OSError, match="injected write failure"):
        generate_annotation_pack(
            sources.inventory,
            sources.provenance,
            sources.specification,
            output,
        )
    assert output.is_dir()
    assert list(output.iterdir()) == []


def test_generated_records_keep_every_human_field_pending(tmp_path: Path) -> None:
    _, pack = _generate(tmp_path)
    for record in _annotation_records(pack).values():
        assert record["annotation_status"] == "pending"
        assert record["actual_condition_observed"] is None
        assert record["final_expected_validity"] is None
        assert record["completed_repetitions"] is None
        assert record["complete_repetition_intervals"] == []
        assert record["visibility_observations"] == {}
        assert record["primary_annotation"]["completed"] is None
        assert record["second_review"]["reviewer_id"] is None
        assert record["decision"]["include_or_reject"] is None
        assert record["provisional_validity"]["authority"] == "provisional_only"
        assert record["provisional_validity"]["is_authoritative"] is False
        assert record["final_expected_validity"] != record["provisional_validity"]["value"]


def test_generated_records_contain_no_cv_results_or_approval_manifest(tmp_path: Path) -> None:
    _, pack = _generate(tmp_path)
    encoded = json.dumps(_annotation_records(pack))
    for forbidden in (
        "detected_repetitions",
        "calibration_quality",
        "pose_results",
        "approved_for_inference",
        "inference_manifest",
    ):
        assert forbidden not in encoded


def test_complete_valid_annotations_are_derived_approved(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    _complete_pack(pack)
    report_path = tmp_path / "report.json"
    report = _validate(sources, pack, report_path)
    assert report["overall_status"] == "approved"
    assert report["all_selected_cases_approved"] is True
    assert {result["derived_status"] for result in report["case_results"]} == {
        "approved"
    }
    assert report_path.read_bytes()[:3] != b"\xef\xbb\xbf"


@pytest.mark.parametrize("case_id", [CASE_IDS[0], CASE_IDS[1]])
def test_annotation_schema_rejects_omitted_control_case_id(
    tmp_path: Path, case_id: str
) -> None:
    def change(record: dict[str, Any]) -> None:
        record.pop("control_case_id")

    _, result = _mutate_completed_case(tmp_path, case_id, change)
    assert result["derived_status"] == "invalid"
    assert any("control_case_id is required" in error for error in result["errors"])


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_non_finite_annotation_input_is_rejected_without_report(
    tmp_path: Path, literal: str
) -> None:
    sources, pack = _generate(tmp_path)
    _complete_pack(pack)
    annotation = _annotation_paths(pack)["cs-real-clean-004"]
    _replace_text_once(annotation, '"start_s": 6.0', f'"start_s": {literal}')
    report = tmp_path / "report.json"
    with pytest.raises(
        AnnotationDataError,
        match=r"complete_repetition_intervals\[0\]\.start_s.*non-finite",
    ):
        _validate(sources, pack, report)
    assert not report.exists()


def test_missing_human_fields_remain_pending(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    report = _validate(sources, pack)
    assert report["overall_status"] == "pending"
    assert all(result["incomplete_fields"] for result in report["case_results"])


def test_symlink_annotation_directory_is_rejected_when_supported(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    linked_pack = tmp_path / "linked-pack"
    try:
        linked_pack.symlink_to(pack, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"directory symlinks are unavailable: {exc}")
    with pytest.raises(AnnotationDataError, match="symbolic link|reparse point"):
        _validate(sources, linked_pack)


def _mutate_completed_case(
    tmp_path: Path,
    case_id: str,
    change: Callable[[dict[str, Any]], None],
) -> tuple[dict[str, Any], dict[str, Any]]:
    sources, pack = _generate(tmp_path)
    _complete_pack(pack)
    path = _annotation_paths(pack)[case_id]
    record = _read(path)
    change(record)
    _dump(path, record)
    report = _validate(sources, pack)
    result = next(item for item in report["case_results"] if item["case_id"] == case_id)
    return report, result


def test_repetition_count_must_equal_complete_interval_count(tmp_path: Path) -> None:
    _, result = _mutate_completed_case(
        tmp_path,
        "cs-real-clean-004",
        lambda record: record.update(completed_repetitions=3),
    )
    assert result["derived_status"] == "invalid"
    assert any("must equal" in error for error in result["errors"])


@pytest.mark.parametrize("problem", ["overlap", "out-of-window"])
def test_intervals_must_not_overlap_or_leave_active_window(
    tmp_path: Path, problem: str
) -> None:
    def change(record: dict[str, Any]) -> None:
        if problem == "overlap":
            record["complete_repetition_intervals"][1] = {
                "start_s": 6.5,
                "end_s": 8.0,
            }
        else:
            record["complete_repetition_intervals"][0] = {
                "start_s": 4.5,
                "end_s": 6.0,
            }

    _, result = _mutate_completed_case(tmp_path, "cs-real-clean-004", change)
    assert result["derived_status"] == "invalid"
    assert any(
        word in " ".join(result["errors"]) for word in ("overlap", "contained")
    )


def test_incomplete_case_cannot_record_positive_repetitions(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["completed_repetitions"] = 1
        record["complete_repetition_intervals"] = [{"start_s": 8.0, "end_s": 8.8}]
        record["second_review"]["reviewed_completed_repetitions"] = 1

    _, result = _mutate_completed_case(
        tmp_path, "cs-real-incomplete-007", change
    )
    assert result["derived_status"] == "invalid"
    assert any("must have completed_repetitions equal to zero" in error for error in result["errors"])


def test_calibration_motion_case_requires_calibration_interval(tmp_path: Path) -> None:
    _, result = _mutate_completed_case(
        tmp_path,
        "cs-real-calibration-motion-008",
        lambda record: record.update(calibration_motion_interval=None),
    )
    assert result["derived_status"] != "approved"
    assert any("calibration_motion_interval" in field for field in result["incomplete_fields"])


def test_contradictory_visibility_is_invalid(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["visibility_observations"]["ankles"] = "visible"

    _, result = _mutate_completed_case(
        tmp_path, "cs-real-ankles-cropped-006", change
    )
    assert result["derived_status"] == "invalid"
    assert any("contradicts" in error for error in result["errors"])


def test_reviewer_ids_must_be_distinct(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["second_review"]["reviewer_id"] = record["primary_annotation"]["annotator_id"]

    _, result = _mutate_completed_case(tmp_path, "cs-real-clean-004", change)
    assert result["derived_status"] == "invalid"
    assert any("distinct" in error for error in result["errors"])


@pytest.mark.parametrize("reviewer", ["primary", "second", "adjudicator"])
def test_reviewer_ids_must_use_portable_identifier_rules(
    tmp_path: Path, reviewer: str
) -> None:
    case_id = (
        "cs-real-calibration-motion-008"
        if reviewer == "adjudicator"
        else "cs-real-clean-004"
    )

    def change(record: dict[str, Any]) -> None:
        if reviewer == "primary":
            record["primary_annotation"]["annotator_id"] = "C:\\private\\reviewer"
        elif reviewer == "second":
            record["second_review"]["reviewer_id"] = "reviewer/second"
        else:
            record["adjudication"]["adjudicator_id"] = "reviewer adjudicator"

    _, result = _mutate_completed_case(tmp_path, case_id, change)
    assert result["derived_status"] == "invalid"
    assert any("identifier" in error for error in result["errors"])


def test_source_case_ids_must_use_portable_identifier_rules(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    _rewrite(
        sources,
        "inventory",
        lambda payload: payload["cases"][0].update(case_id="C:\\private\\case"),
    )
    with pytest.raises(AnnotationDataError, match="portable identifier"):
        load_and_validate_sources(
            sources.inventory, sources.provenance, sources.specification
        )


def test_both_reviewers_must_attest_blinding(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["second_review"]["blinding_attestation"] = None

    _, result = _mutate_completed_case(tmp_path, "cs-real-clean-004", change)
    assert result["derived_status"] == "pending"
    assert any("blinding" in field for field in result["incomplete_fields"])


def test_reviewer_disagreement_requires_resolved_adjudication(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["second_review"]["reviewed_completed_repetitions"] = 1

    _, result = _mutate_completed_case(tmp_path, "cs-real-clean-004", change)
    assert result["derived_status"] == "invalid"
    assert any("resolved adjudication" in error for error in result["errors"])


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("adjudicator_id", "unexpected-adjudicator"),
        ("completed_repetitions", 2),
        ("final_expected_validity", "valid_movement"),
    ],
)
def test_reviewer_agreement_rejects_unexpected_adjudication_values(
    tmp_path: Path, field: str, value: Any
) -> None:
    def change(record: dict[str, Any]) -> None:
        record["adjudication"][field] = value

    _, result = _mutate_completed_case(tmp_path, CASE_IDS[0], change)
    assert result["derived_status"] == "invalid"
    assert any(
        field in error and "must be empty" in error for error in result["errors"]
    )


def test_disagreement_rejects_non_independent_adjudicator(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["second_review"]["reviewed_completed_repetitions"] = 1
        record["adjudication"] = {
            "resolved": True,
            "adjudicator_id": record["primary_annotation"]["annotator_id"],
            "completed_repetitions": record["completed_repetitions"],
            "final_expected_validity": record["final_expected_validity"],
            "rationale": "Independent resolution was requested.",
        }

    _, result = _mutate_completed_case(tmp_path, CASE_IDS[0], change)
    assert result["derived_status"] == "invalid"
    assert any("independent of both reviewers" in error for error in result["errors"])


def test_valid_disagreement_resolution_is_approved(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["second_review"]["reviewed_completed_repetitions"] = 1
        record["adjudication"] = {
            "resolved": True,
            "adjudicator_id": "reviewer-adjudicator",
            "completed_repetitions": record["completed_repetitions"],
            "final_expected_validity": record["final_expected_validity"],
            "rationale": "The complete intervals support the top-level count.",
        }

    _, result = _mutate_completed_case(tmp_path, CASE_IDS[0], change)
    assert result["derived_status"] == "approved"
    assert result["errors"] == []


def test_valid_no_adjudication_required_record_is_approved(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    _complete_pack(pack)
    record = _annotation_records(pack)[CASE_IDS[0]]
    assert record["adjudication"] == {
        "resolved": False,
        "adjudicator_id": None,
        "completed_repetitions": None,
        "final_expected_validity": None,
        "rationale": None,
    }
    report = _validate(sources, pack)
    result = next(
        item for item in report["case_results"] if item["case_id"] == CASE_IDS[0]
    )
    assert result["derived_status"] == "approved"


def test_case_008_valid_adjudication_path_remains_approved(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    _complete_pack(pack)
    record = _annotation_records(pack)["cs-real-calibration-motion-008"]
    assert record["adjudication"]["resolved"] is True
    report = _validate(sources, pack)
    result = next(
        item
        for item in report["case_results"]
        if item["case_id"] == "cs-real-calibration-motion-008"
    )
    assert result["derived_status"] == "approved"


def test_pending_rejected_and_approved_states_remain_distinct(tmp_path: Path) -> None:
    pending_sources, pending_pack = _generate(tmp_path / "pending")
    assert _validate(pending_sources, pending_pack)["overall_status"] == "pending"

    rejected_sources, rejected_pack = _generate(tmp_path / "rejected")
    _complete_pack(rejected_pack)
    rejected_path = _annotation_paths(rejected_pack)[CASE_IDS[0]]
    rejected = _read(rejected_path)
    _complete_record(rejected, reject=True)
    _dump(rejected_path, rejected)
    rejected_report = _validate(rejected_sources, rejected_pack)
    assert rejected_report["overall_status"] == "rejected"
    assert any(
        result["derived_status"] == "rejected"
        for result in rejected_report["case_results"]
    )

    approved_sources, approved_pack = _generate(tmp_path / "approved")
    _complete_pack(approved_pack)
    assert _validate(approved_sources, approved_pack)["overall_status"] == "approved"


def test_rejection_without_reason_is_invalid(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["decision"] = {"include_or_reject": "reject", "rejection_reason": None}

    _, result = _mutate_completed_case(tmp_path, "cs-real-clean-004", change)
    assert result["derived_status"] == "invalid"
    assert any("rejection reason" in error for error in result["errors"])


@pytest.mark.parametrize("problem", ["changed", "removed"])
def test_annotation_status_is_immutable(
    tmp_path: Path, problem: str
) -> None:
    def change(record: dict[str, Any]) -> None:
        if problem == "changed":
            record["annotation_status"] = "approved"
        else:
            record.pop("annotation_status")

    _, result = _mutate_completed_case(
        tmp_path, "cs-real-clean-004", change
    )
    assert result["derived_status"] == "invalid"
    assert any("annotation_status" in error for error in result["errors"])


def test_unknown_top_level_annotation_key_is_rejected(tmp_path: Path) -> None:
    _, result = _mutate_completed_case(
        tmp_path,
        "cs-real-clean-004",
        lambda record: record.update(unexpected_annotation_key="untrusted"),
    )
    assert result["derived_status"] == "invalid"
    assert any("unknown keys" in error for error in result["errors"])


@pytest.mark.parametrize("section", ["human", "machine"])
def test_unknown_nested_annotation_key_is_rejected(
    tmp_path: Path, section: str
) -> None:
    def change(record: dict[str, Any]) -> None:
        if section == "human":
            record["primary_annotation"]["unexpected"] = True
        else:
            record["sources"]["inventory"]["unexpected"] = True

    _, result = _mutate_completed_case(
        tmp_path, "cs-real-clean-004", change
    )
    assert result["derived_status"] == "invalid"
    assert any("unexpected" in error for error in result["errors"])


@pytest.mark.parametrize(
    "field",
    [
        "detected_repetitions",
        "calibration_quality",
        "pose_results",
        "pose_landmarks",
        "rep_error",
        "passed",
        "failure_category",
        "runtime_failure_category",
        "approved_for_inference",
        "derived_status",
        "model_prediction",
        "cv_result",
    ],
)
def test_manually_supplied_cv_or_approval_field_is_rejected(
    tmp_path: Path, field: str
) -> None:
    _, result = _mutate_completed_case(
        tmp_path,
        "cs-real-clean-004",
        lambda record: record.update({field: True}),
    )
    assert result["derived_status"] == "invalid"
    assert any(field in error for error in result["errors"])


@pytest.mark.parametrize("problem", ["unknown", "duplicate", "missing"])
def test_unknown_duplicate_and_missing_annotation_cases_are_detected(
    tmp_path: Path, problem: str
) -> None:
    sources, pack = _generate(tmp_path)
    paths = _annotation_paths(pack)
    if problem == "unknown":
        record = _read(paths[CASE_IDS[0]])
        record["case_id"] = "unknown-case"
        _dump(pack / "unknown.annotation.json", record)
    elif problem == "duplicate":
        _dump(pack / "duplicate.annotation.json", _read(paths[CASE_IDS[0]]))
    else:
        paths[CASE_IDS[0]].unlink()
    report = _validate(sources, pack)
    assert report["overall_status"] != "approved"
    encoded = json.dumps(report)
    assert problem in encoded or (problem == "missing" and "record is missing" in encoded)


def test_validator_confirms_machine_metadata_and_source_hashes(tmp_path: Path) -> None:
    def change(record: dict[str, Any]) -> None:
        record["inventory_metadata"]["fps"] = 11.0
        record["video_filename"] = "different.mp4"
        record["sources"]["inventory"]["sha256"] = "a" * 64

    _, result = _mutate_completed_case(tmp_path, "cs-real-clean-004", change)
    assert result["derived_status"] == "invalid"
    assert any("authoritative" in error for error in result["errors"])


def test_report_overwrite_is_refused(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    report = tmp_path / "validation-report.json"
    _validate(sources, pack, report)
    original = report.read_bytes()
    with pytest.raises(FileExistsError, match="already exists"):
        _validate(sources, pack, report)
    assert report.read_bytes() == original


def test_report_output_reparse_parent_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sources, pack = _generate(tmp_path)
    report_parent = tmp_path / "reports"
    report_parent.mkdir()
    report_parent_absolute = generator_module._absolute_path(report_parent)
    real_lstat = generator_module._path_lstat
    reparse_attribute = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)

    def lstat_with_reparse(path: Path) -> Any:
        result = real_lstat(path)
        if generator_module._absolute_path(path) == report_parent_absolute:
            return SimpleNamespace(
                st_mode=result.st_mode,
                st_file_attributes=reparse_attribute,
            )
        return result

    monkeypatch.setattr(generator_module, "_path_lstat", lstat_with_reparse)
    report = report_parent / "validation-report.json"
    with pytest.raises(AnnotationDataError, match="junction|reparse point"):
        _validate(sources, pack, report)
    assert not report.exists()


def test_cli_exit_codes_are_nonzero_until_every_case_is_approved(tmp_path: Path) -> None:
    sources = _write_sources(tmp_path)
    output = tmp_path / "cli-output"
    assert generator_main(
        [
            "--inventory",
            str(sources.inventory),
            "--session-provenance",
            str(sources.provenance),
            "--case-specification",
            str(sources.specification),
            "--output-directory",
            str(output),
        ]
    ) == 0
    pack = next(output.iterdir())
    common = [
        "--inventory",
        str(sources.inventory),
        "--session-provenance",
        str(sources.provenance),
        "--case-specification",
        str(sources.specification),
        "--annotation-directory",
        str(pack),
    ]
    assert validator_main(common + ["--report-output", str(tmp_path / "pending.json")]) == 1
    _complete_pack(pack)
    assert validator_main(common + ["--report-output", str(tmp_path / "approved.json")]) == 0


def test_implementation_has_no_forbidden_production_or_cv_imports() -> None:
    implementation_directory = Path(__file__).parents[1] / "validation" / "chair_stand"
    files = [
        implementation_directory / "generate_annotation_pack.py",
        implementation_directory / "validate_annotations.py",
    ]
    forbidden_roots = {"cv2", "mediapipe"}
    forbidden_modules = {
        "validation.chair_stand.replay",
        "validation.chair_stand.production_mapping",
    }
    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        imports: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.append(node.module)
        assert not forbidden_roots & {name.split(".")[0] for name in imports}
        assert not forbidden_modules & set(imports)
        assert not any(name == "app" or name.startswith("app.") for name in imports)


def test_generated_records_and_reports_do_not_leak_private_absolute_paths(
    tmp_path: Path,
) -> None:
    sources, pack = _generate(tmp_path)
    generated = json.dumps(_annotation_records(pack), ensure_ascii=False)
    report = json.dumps(_validate(sources, pack), ensure_ascii=False)
    private_fragments = {
        str(tmp_path),
        str(tmp_path).replace("\\", "/"),
        str(Path.home()),
        str(Path.home()).replace("\\", "/"),
    }
    assert not any(fragment in generated for fragment in private_fragments)
    assert not any(fragment in report for fragment in private_fragments)


def test_validation_never_changes_annotations_or_sources(tmp_path: Path) -> None:
    sources, pack = _generate(tmp_path)
    observed = {
        path: path.read_bytes()
        for path in (sources.inventory, sources.provenance, sources.specification, *pack.iterdir())
    }
    _validate(sources, pack, tmp_path / "report.json")
    assert {path: path.read_bytes() for path in observed} == observed
