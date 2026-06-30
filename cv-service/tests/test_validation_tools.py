"""Tests for MAE logging and SynthDa landmark replay helpers."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / 'validation' / 'record_session.py'
REPLAY = ROOT / 'validation' / 'synthda' / 'replay_landmarks.py'
MAE = ROOT / 'validation' / 'compute_mae.py'


def test_record_session_appends_and_updates(tmp_path: Path) -> None:
    csv_path = tmp_path / 'pilot.csv'
    base = [
        sys.executable,
        str(RECORD),
        '--csv',
        str(csv_path),
        '--session',
        'sr-p01',
        '--environment',
        'bedroom',
        '--age-group',
        'young_adult',
        '--height',
        '170',
        '--manual',
        '10.0',
        '--cv',
        '11.0',
    ]
    assert subprocess.run(base, capture_output=True, text=True, check=False).returncode == 0
    assert subprocess.run([*base, '--cv', '12.0'], capture_output=True, text=True, check=False).returncode == 0

    mae = subprocess.run(
        [sys.executable, str(MAE), str(csv_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert mae.returncode == 0
    assert 'MAE:  2.00 cm' in mae.stdout


def test_synthda_replay_demo() -> None:
    result = subprocess.run(
        [sys.executable, str(REPLAY), '--demo'],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(ROOT),
    )
    assert result.returncode == 0, result.stderr
    assert 'Measurement:' in result.stdout
