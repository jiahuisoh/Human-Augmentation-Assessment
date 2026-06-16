#!/usr/bin/env python3
"""Compute MAE / bias for sit-reach CV vs manual ruler measurements.

Usage:
  python validation/compute_mae.py validation/ground_truth.csv

CSV columns (see ground_truth.template.csv):
  session_id, environment, age_group, user_height_cm, manual_reach_cm, cv_reach_cm, notes

Fill cv_reach_cm after running each session through the CV pipeline.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def main() -> int:
    if len(sys.argv) < 2:
        print('Usage: python validation/compute_mae.py <ground_truth.csv>')
        return 1

    path = Path(sys.argv[1])
    rows = load_rows(path)
    pairs: list[tuple[float, float, dict[str, str]]] = []
    for row in rows:
        manual = row.get('manual_reach_cm', '').strip()
        cv = row.get('cv_reach_cm', '').strip()
        if not manual or not cv:
            continue
        pairs.append((float(manual), float(cv), row))

    if not pairs:
        print('No rows with both manual_reach_cm and cv_reach_cm filled in.')
        return 1

    errors = [cv - manual for manual, cv, _ in pairs]
    abs_errors = [abs(e) for e in errors]
    mae = sum(abs_errors) / len(abs_errors)
    bias = sum(errors) / len(errors)

    print(f'Sessions evaluated: {len(pairs)}')
    print(f'MAE:  {mae:.2f} cm')
    print(f'Bias: {bias:+.2f} cm  (+ = CV over-estimates reach)')
    print()
    print('Per session:')
    for manual, cv, row in pairs:
        err = cv - manual
        sid = row.get('session_id', '?')
        env = row.get('environment', '?')
        age = row.get('age_group', '?')
        print(f'  {sid:12}  manual={manual:5.1f}  cv={cv:5.1f}  err={err:+5.1f}  ({env}, {age})')

    by_env: dict[str, list[float]] = {}
    by_age: dict[str, list[float]] = {}
    for manual, cv, row in pairs:
        by_env.setdefault(row.get('environment', 'unknown'), []).append(abs(cv - manual))
        by_age.setdefault(row.get('age_group', 'unknown'), []).append(abs(cv - manual))
    print()
    print('MAE by environment:')
    for key, vals in sorted(by_env.items()):
        print(f'  {key:14}  {sum(vals)/len(vals):.2f} cm  (n={len(vals)})')
    print('MAE by age group:')
    for key, vals in sorted(by_age.items()):
        print(f'  {key:14}  {sum(vals)/len(vals):.2f} cm  (n={len(vals)})')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
