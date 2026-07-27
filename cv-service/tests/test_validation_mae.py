"""Tests for validation MAE script."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'validation' / 'compute_mae.py'


def test_compute_mae_runs_on_sample(tmp_path: Path) -> None:
    csv_path = tmp_path / 'sample.csv'
    csv_path.write_text(
        'session_id,environment,age_group,user_height_cm,manual_reach_cm,cv_reach_cm,notes\n'
        'a,bedroom,older_adult,165,10.0,12.0,\n'
        'b,centre,older_adult,160,5.0,4.0,\n',
        encoding='utf-8',
    )
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(csv_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert 'MAE:' in result.stdout
    assert '1.00 cm' in result.stdout
