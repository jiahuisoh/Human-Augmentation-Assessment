#!/usr/bin/env python3
"""Offline replay of pose landmark sequences through SitReachStrategy.

Use after extracting landmarks from a SynthDa clip or a recorded session.
This does NOT run MediaPipe — it feeds pre-built landmarks into the same
strategy code the live WebSocket pipeline uses.

JSONL format (one frame per line):
  {"elapsed_ms": 2500, "pose": [[x,y,z,visibility], ... x33], "hands": [[[x,y,z,vis], ... x21]]}
  Optional: "label_reach_cm": 12.0  (ground truth for comparison)

Quick demo (synthetic poses, no SynthDa install needed):
  python validation/synthda/replay_landmarks.py --demo

Real clip:
  python validation/synthda/replay_landmarks.py sequences/my_clip.jsonl --height 170
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.cv.types import Landmark
from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import SitReachStrategy
from tests.helpers import hand_middle_finger_at, sit_reach_side_pose, visible


def landmarks_from_wire(pose: list[list[float]]) -> list[Landmark]:
    out: list[Landmark] = []
    for pt in pose:
        if len(pt) >= 4:
            out.append(Landmark(pt[0], pt[1], pt[2], pt[3]))
        elif len(pt) == 3:
            out.append(Landmark(pt[0], pt[1], pt[2], 0.9))
        else:
            out.append(Landmark(pt[0], pt[1], 0.0, 0.9))
    while len(out) < 33:
        out.append(Landmark(0.0, 0.0, 0.0, 0.0))
    return out[:33]


def hands_from_wire(hands: list[list[list[float]]] | None) -> list[list[Landmark]] | None:
    if not hands:
        return None
    parsed: list[list[Landmark]] = []
    for hand in hands:
        pts: list[Landmark] = []
        for pt in hand:
            if len(pt) >= 4:
                pts.append(Landmark(pt[0], pt[1], pt[2], pt[3]))
            else:
                pts.append(Landmark(pt[0], pt[1], 0.0, 0.9))
        while len(pts) < 21:
            pts.append(Landmark(0.0, 0.0, 0.0, 0.0))
        parsed.append(pts[:21])
    return parsed


def wire_from_landmarks(landmarks: list[Landmark]) -> list[list[float]]:
    return [[lm.x, lm.y, lm.z, lm.visibility] for lm in landmarks]


def wire_from_hands(hands: list[list[Landmark]]) -> list[list[list[float]]]:
    return [wire_from_landmarks(h) for h in hands]


def build_demo_sequence() -> list[dict]:
    """Minimal calib + reach hold sequence using test helpers."""
    frames: list[dict] = []
    rest = sit_reach_side_pose(side='right', finger=(0.50, 0.70))
    reach = sit_reach_side_pose(side='right', finger=(0.65, 0.70))
    hands_rest = hand_middle_finger_at(0.50, 0.70)
    hands_reach = hand_middle_finger_at(0.65, 0.70)

    for i in range(12):
        frames.append({
            'elapsed_ms': (i + 1) * 250.0,
            'pose': wire_from_landmarks(rest),
            'hands': wire_from_hands(hands_rest),
        })
    for i in range(20):
        frames.append({
            'elapsed_ms': 3000.0 + (i + 1) * 250.0,
            'pose': wire_from_landmarks(reach),
            'hands': wire_from_hands(hands_reach),
        })
    return frames


def load_frames(path: Path) -> list[dict]:
    frames: list[dict] = []
    with path.open(encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                frames.append(json.loads(line))
    return frames


def replay(
    frames: list[dict],
    *,
    height_cm: float | None,
    sex: str,
    calib_frames: int = 12,
) -> dict:
    strategy = SitReachStrategy()
    strategy.reset()
    strategy.on_init(None, sex, height_cm)

    label_reach = next((f.get('label_reach_cm') for f in frames if 'label_reach_cm' in f), None)

    for i, frame in enumerate(frames):
        pose = landmarks_from_wire(frame['pose'])
        hands = hands_from_wire(frame.get('hands'))
        elapsed_ms = float(frame.get('elapsed_ms', (i + 1) * 250.0))

        if i < calib_frames:
            strategy.on_calibration_frame(pose, hands)
            continue

        if i == calib_frames:
            ok, reason = strategy.finish_calibration()
            if not ok:
                return {'ok': False, 'reason': reason or 'calibration failed'}

        strategy.update(pose, elapsed_ms, hands)

    outcome = strategy.finalize(FinalizeContext(user_age=None, user_sex=sex, terminated_early=False))
    result = {
        'ok': True,
        'measurement_cm': outcome.measurement,
        'calibration_quality': outcome.calibration_quality,
        'classification': outcome.classification,
        'label_reach_cm': label_reach,
    }
    if label_reach is not None and outcome.measurement is not None:
        result['error_cm'] = round(outcome.measurement - float(label_reach), 2)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description='Replay landmark JSONL through sit-reach strategy.')
    parser.add_argument('jsonl', nargs='?', type=Path, help='Path to .jsonl frame file')
    parser.add_argument('--demo', action='store_true', help='Run built-in synthetic demo sequence')
    parser.add_argument('--height', type=float, default=165.0, help='Subject height cm for scale')
    parser.add_argument('--sex', choices=['male', 'female', 'other'], default='male')
    parser.add_argument('--calib-frames', type=int, default=12, help='Frames used for calibration')
    args = parser.parse_args()

    if args.demo:
        frames = build_demo_sequence()
        source = 'demo'
    elif args.jsonl:
        frames = load_frames(args.jsonl)
        source = str(args.jsonl)
    else:
        parser.error('Provide a JSONL path or use --demo')
        return 1

    if not frames:
        print('No frames to replay.')
        return 1

    result = replay(frames, height_cm=args.height, sex=args.sex, calib_frames=args.calib_frames)
    print(f'Source: {source}')
    if not result.get('ok'):
        print(f'FAILED: {result.get("reason")}')
        return 1

    print(f'Measurement: {result["measurement_cm"]} cm')
    print(f'Calibration quality: {result.get("calibration_quality")}')
    if result.get('label_reach_cm') is not None:
        print(f'Label reach: {result["label_reach_cm"]} cm')
        print(f'Error: {result.get("error_cm"):+.2f} cm')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
