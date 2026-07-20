"""Tests for MAE logging and SynthDa landmark replay helpers."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / 'validation' / 'record_session.py'
REPLAY = ROOT / 'validation' / 'synthda' / 'replay_landmarks.py'
GENERATE = ROOT / 'validation' / 'synthda' / 'generate_synth_sequences.py'
BATCH = ROOT / 'validation' / 'synthda' / 'batch_replay.py'
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


def test_generate_and_batch_replay(tmp_path: Path) -> None:
    out_dir = tmp_path / 'sequences'
    gen = subprocess.run(
        [sys.executable, str(GENERATE), '--out-dir', str(out_dir)],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(ROOT),
    )
    assert gen.returncode == 0, gen.stderr
    assert (out_dir / 'synth_reach_medium.jsonl').exists()

    batch = subprocess.run(
        [sys.executable, str(BATCH), '--dir', str(out_dir)],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(ROOT),
    )
    assert batch.returncode == 0, batch.stderr
    assert 'synth_reach_medium' in batch.stdout
    assert (out_dir / 'synth_replay_report.json').exists()
