"""Shared landmark ↔ JSONL wire format for offline replay."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.cv.types import Landmark


def landmarks_to_wire(landmarks: list[Landmark]) -> list[list[float]]:
    return [[lm.x, lm.y, lm.z, lm.visibility] for lm in landmarks]


def hands_to_wire(hands: list[list[Landmark]]) -> list[list[list[float]]]:
    return [landmarks_to_wire(h) for h in hands]


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


def frame_to_line(
    *,
    elapsed_ms: float,
    pose: list[Landmark],
    hands: list[list[Landmark]] | None = None,
    **meta: Any,
) -> str:
    row: dict[str, Any] = {
        'elapsed_ms': elapsed_ms,
        'pose': landmarks_to_wire(pose),
        'hands': hands_to_wire(hands) if hands else [],
    }
    row.update(meta)
    return json.dumps(row)


def load_frames(path: Path) -> list[dict]:
    frames: list[dict] = []
    with path.open(encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                frames.append(json.loads(line))
    return frames


def write_frames(path: Path, frames: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        for frame in frames:
            f.write(json.dumps(frame) + '\n')
