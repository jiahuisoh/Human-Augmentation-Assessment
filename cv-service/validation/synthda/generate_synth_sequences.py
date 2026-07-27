#!/usr/bin/env python3
"""Generate labelled synthetic sit-reach JSONL sequences (SynthDa-style offline data).

No SynthDa install required — uses the same pose helpers as unit tests.
Outputs clips with label_reach_cm computed from the strategy geometry.

Usage:
  python validation/synthda/generate_synth_sequences.py
  python validation/synthda/generate_synth_sequences.py --out-dir validation/synthda/sequences
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.tests.sit_reach.strategy import (
    ASSUMED_HEIGHT_CM,
    LEG_LENGTH_FRACTION_OF_HEIGHT,
    forward_offset,
    forward_unit,
    reach_from_baseline,
    toe_line_landmark,
)
from tests.helpers import hand_middle_finger_at, sit_reach_side_pose, visible
from validation.synthda.landmark_io import landmarks_to_wire, write_frames


def _expected_reach_cm(finger_x: float, *, height_cm: float = ASSUMED_HEIGHT_CM) -> float:
    hip = visible(0.30, 0.55)
    ankle = visible(0.70, 0.55)
    toe_tip = visible(0.78, 0.55)
    toe = toe_line_landmark(ankle, toe_tip)
    finger = visible(finger_x, 0.50)
    fwd = forward_unit(hip, ankle, toe_tip)
    baseline = forward_offset(toe, hip, fwd)
    scale = height_cm * LEG_LENGTH_FRACTION_OF_HEIGHT / 0.4
    return round(reach_from_baseline(finger, hip, fwd, baseline) * scale, 1)


def build_sequence(
    *,
    finger_x: float,
    height_cm: float = ASSUMED_HEIGHT_CM,
    calib_frames: int = 12,
    hold_frames: int = 24,
    bent_knee: bool = False,
) -> tuple[list[dict], float]:
    knee = (0.50, 0.59) if bent_knee else (0.50, 0.55)
    rest = sit_reach_side_pose(side='right', knee=knee, finger=(0.70, 0.50))
    reach = sit_reach_side_pose(side='right', knee=knee, finger=(finger_x, 0.50))
    hands_rest = hand_middle_finger_at(0.70, 0.50)
    hands_reach = hand_middle_finger_at(finger_x, 0.50)

    label = _expected_reach_cm(finger_x, height_cm=height_cm)
    frames: list[dict] = []

    for i in range(calib_frames):
        frames.append({
            'elapsed_ms': (i + 1) * 250.0,
            'pose': landmarks_to_wire(rest),
            'hands': [landmarks_to_wire(h) for h in hands_rest],
            **({'label_reach_cm': label} if i == 0 else {}),
        })

    for i in range(hold_frames):
        frames.append({
            'elapsed_ms': 3000.0 + (i + 1) * 250.0,
            'pose': landmarks_to_wire(reach),
            'hands': [landmarks_to_wire(h) for h in hands_reach],
        })

    return frames, label


CLIPS = [
    ('synth_reach_short', 0.70),
    ('synth_reach_medium', 0.88),
    ('synth_reach_long', 0.95),
]


def main() -> int:
    parser = argparse.ArgumentParser(description='Generate synthetic labelled JSONL clips.')
    parser.add_argument('--out-dir', type=Path, default=Path('validation/synthda/sequences'))
    parser.add_argument('--height', type=float, default=ASSUMED_HEIGHT_CM)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    for name, finger_x in CLIPS:
        frames, label = build_sequence(finger_x=finger_x, height_cm=args.height)
        out_path = args.out_dir / f'{name}.jsonl'
        write_frames(out_path, frames)
        manifest.append({'file': str(out_path), 'finger_x': finger_x, 'label_reach_cm': label})
        print(f'{name}: label={label} cm -> {out_path}')

    bent_frames, _ = build_sequence(finger_x=0.88, bent_knee=True)
    bent_path = args.out_dir / 'synth_bent_knee.jsonl'
    write_frames(bent_path, bent_frames)
    manifest.append({'file': str(bent_path), 'note': 'bent knee — expect form_hint / no score'})
    print(f'synth_bent_knee -> {bent_path}')

    manifest_path = args.out_dir / 'synth_manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Manifest -> {manifest_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
