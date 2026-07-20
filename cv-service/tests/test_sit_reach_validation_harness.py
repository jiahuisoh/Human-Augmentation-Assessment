"""Tests for sit-reach video validation harness (tools/)."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'tools'


def test_validate_sit_reach_config_rejects_bad_tolerance() -> None:
    from tools.validate_sit_reach_video import ValidationConfig, validate_config

    config = ValidationConfig(
        video_path=Path('x.mp4'),
        expected_reach_cm=10.0,
        expected_validity='valid_movement',
        scenario='test',
        camera_angle='side',
        calibration_seconds=3.0,
        countdown_seconds=3.0,
        max_test_seconds=30.0,
        user_age=70,
        user_sex='other',
        user_height_cm=165.0,
        reach_tolerance_cm=-1.0,
        min_usable_frame_ratio=0.2,
        output_json=None,
        debug_csv=None,
    )
    try:
        validate_config(config)
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_validation_common_load_manifest(tmp_path: Path) -> None:
    manifest = tmp_path / 'm.csv'
    manifest.write_text(
        'video_path,expected_reach_cm,expected_validity,scenario,camera_angle,user_height_cm,notes\n'
        'clip.mp4,12.0,valid_movement,full_reach,side,170,\n',
        encoding='utf-8',
    )
    sys.path.insert(0, str(TOOLS))
    from validation_common import load_manifest

    rows = load_manifest(manifest)
    assert rows[0]['expected_reach_cm'] == '12.0'


def test_validate_missing_video_returns_invalid() -> None:
    sys.path.insert(0, str(ROOT))
    from tools.validate_sit_reach_video import ValidationConfig, validate_video

    result = validate_video(
        ValidationConfig(
            video_path=Path('definitely_missing_video_12345.mp4'),
            expected_reach_cm=10.0,
            expected_validity='invalid_input',
            scenario='no_person',
            camera_angle='side',
            calibration_seconds=3.0,
            countdown_seconds=3.0,
            max_test_seconds=30.0,
            user_age=70,
            user_sex='other',
            user_height_cm=165.0,
            reach_tolerance_cm=3.0,
            min_usable_frame_ratio=0.2,
            output_json=None,
            debug_csv=None,
        ),
    )
    assert result.status == 'invalid_video'
    assert result.passed is True
