#!/usr/bin/env python3
"""One-shot: video → landmarks → CV score (for MAE pilot sessions).

Usage (after filming sr-p01):
  python validation/run_recording.py my_session.webm \\
    --session sr-p01 \\
    --environment bedroom \\
    --age-group young_adult \\
    --height 170 \\
    --manual 12.5 \\
    --notes "Desk webcam evening"

Steps:
  1. Extracts pose/hands to JSONL (MediaPipe)
  2. Replays through SitReachStrategy → cv_reach_cm
  3. Logs row in ground_truth.pilot.csv via record_session.py
  4. Prints MAE if enough rows filled
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from validation.synthda.extract_poses_from_video import extract
from validation.synthda.landmark_io import write_frames
from validation.synthda.replay_landmarks import replay


def main() -> int:
    parser = argparse.ArgumentParser(description='Process a sit-reach recording end-to-end.')
    parser.add_argument('video', type=Path, help='Recorded session video')
    parser.add_argument('--session', required=True, help='e.g. sr-p01')
    parser.add_argument('--environment', choices=['bedroom', 'centre'], required=True)
    parser.add_argument('--age-group', choices=['older_adult', 'young_adult'], required=True)
    parser.add_argument('--height', type=float, required=True)
    parser.add_argument('--manual', type=float, required=True, help='Ruler measurement (cm)')
    parser.add_argument('--notes', default='')
    parser.add_argument('--csv', type=Path, default=Path('validation/ground_truth.pilot.csv'))
    parser.add_argument('--sequences-dir', type=Path, default=Path('validation/synthda/sequences'))
    parser.add_argument('--skip-csv', action='store_true', help='Only extract + replay, do not log CSV')
    args = parser.parse_args()

    if not args.video.exists():
        print(f'Video not found: {args.video}')
        return 1

    args.sequences_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = args.sequences_dir / f'{args.session}.jsonl'

    print(f'[1/3] Extracting landmarks from {args.video.name}...')
    frames = extract(
        args.video,
        label_reach_cm=args.manual,
        session_id=args.session,
    )
    write_frames(jsonl_path, frames)
    print(f'      -> {len(frames)} frames saved to {jsonl_path}')

    print('[2/3] Replaying through SitReachStrategy...')
    result = replay(frames, height_cm=args.height, sex='male', calib_frames=12)
    if not result.get('ok'):
        print(f'FAILED: {result.get("reason")}')
        return 1

    cv_cm = result['measurement_cm']
    print(f'      CV measurement: {cv_cm} cm  (calib quality: {result.get("calibration_quality")})')
    print(f'      Manual ruler:   {args.manual} cm  ->  error {cv_cm - args.manual:+.1f} cm')

    if args.skip_csv:
        return 0

    print('[3/3] Logging to CSV...')
    record = ROOT / 'validation' / 'record_session.py'
    proc = subprocess.run(
        [
            sys.executable,
            str(record),
            '--csv',
            str(args.csv),
            '--session',
            args.session,
            '--environment',
            args.environment,
            '--age-group',
            args.age_group,
            '--height',
            str(args.height),
            '--manual',
            str(args.manual),
            '--cv',
            str(cv_cm),
            '--notes',
            args.notes,
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    print(proc.stdout, end='')
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        return proc.returncode

    mae = ROOT / 'validation' / 'compute_mae.py'
    mae_proc = subprocess.run(
        [sys.executable, str(mae), str(args.csv)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    if mae_proc.returncode == 0:
        print()
        print(mae_proc.stdout, end='')
    else:
        print('(MAE summary available after more sessions have cv_reach_cm filled)')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
