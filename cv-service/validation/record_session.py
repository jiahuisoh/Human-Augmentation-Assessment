#!/usr/bin/env python3
"""Log or update one sit-reach validation row after a filmed session.

Usage:
  python validation/record_session.py \\
    --csv validation/ground_truth.pilot.csv \\
    --session sr-p01 \\
    --environment bedroom \\
    --age-group young_adult \\
    --height 170 \\
    --manual 12.5 \\
    --cv 11.8 \\
    --notes "Evening light; laptop on desk"

If --session already exists, that row is updated; otherwise a new row is appended.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

COLUMNS = [
    'session_id',
    'environment',
    'age_group',
    'user_height_cm',
    'manual_reach_cm',
    'cv_reach_cm',
    'notes',
]


def load_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def write_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, '') for col in COLUMNS})


def main() -> int:
    parser = argparse.ArgumentParser(description='Record one sit-reach MAE session row.')
    parser.add_argument('--csv', type=Path, default=Path('validation/ground_truth.pilot.csv'))
    parser.add_argument('--session', required=True, help='e.g. sr-p01')
    parser.add_argument('--environment', choices=['bedroom', 'centre'], required=True)
    parser.add_argument('--age-group', choices=['older_adult', 'young_adult'], required=True)
    parser.add_argument('--height', type=float, required=True, help='Subject height in cm')
    parser.add_argument('--manual', type=float, required=True, help='Ruler reach at toe line (cm)')
    parser.add_argument('--cv', type=float, required=True, help='CV Sandbox final measurement (cm)')
    parser.add_argument('--notes', default='', help='Lighting, clothing, camera setup')
    args = parser.parse_args()

    rows = load_rows(args.csv)
    row = {
        'session_id': args.session,
        'environment': args.environment,
        'age_group': args.age_group,
        'user_height_cm': str(args.height),
        'manual_reach_cm': str(args.manual),
        'cv_reach_cm': str(args.cv),
        'notes': args.notes,
    }

    updated = False
    for i, existing in enumerate(rows):
        if existing.get('session_id') == args.session:
            rows[i] = row
            updated = True
            break
    if not updated:
        rows.append(row)

    write_rows(args.csv, rows)
    action = 'Updated' if updated else 'Added'
    print(f'{action} {args.session} in {args.csv}')
    print(f'  manual={args.manual:.1f} cm  cv={args.cv:.1f} cm  err={args.cv - args.manual:+.1f} cm')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
