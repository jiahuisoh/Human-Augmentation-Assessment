#!/usr/bin/env python3
"""Batch-replay all synthetic JSONL clips and report CV vs label error."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from validation.synthda.landmark_io import load_frames
from validation.synthda.replay_landmarks import replay


def main() -> int:
    parser = argparse.ArgumentParser(description='Replay all synth JSONL clips in a folder.')
    parser.add_argument('--dir', type=Path, default=Path('validation/synthda/sequences'))
    parser.add_argument('--height', type=float, default=165.0)
    parser.add_argument('--pattern', default='synth_*.jsonl')
    args = parser.parse_args()

    files = sorted(args.dir.glob(args.pattern))
    if not files:
        print(f'No files matching {args.pattern} in {args.dir}')
        print('Run: python validation/synthda/generate_synth_sequences.py')
        return 1

    results: list[dict] = []
    for path in files:
        frames = load_frames(path)
        out = replay(frames, height_cm=args.height, sex='male', calib_frames=12)
        row = {
            'file': path.name,
            'ok': out.get('ok', False),
            'cv_cm': out.get('measurement_cm'),
            'label_cm': out.get('label_reach_cm'),
            'error_cm': out.get('error_cm'),
            'calib_quality': out.get('calibration_quality'),
            'reason': out.get('reason'),
        }
        results.append(row)
        status = 'OK' if row['ok'] else 'FAIL'
        err = f"  err={row['error_cm']:+.1f}" if row.get('error_cm') is not None else ''
        print(f'{status:4}  {path.name:24}  cv={row["cv_cm"]}  label={row["label_cm"]}{err}')

    report_path = args.dir / 'synth_replay_report.json'
    report_path.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(f'\nReport -> {report_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
