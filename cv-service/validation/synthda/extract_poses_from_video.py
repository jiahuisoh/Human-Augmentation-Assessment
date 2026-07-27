#!/usr/bin/env python3
"""Extract pose + hand landmarks from a video file to JSONL for offline replay.

Usage:
  python validation/synthda/extract_poses_from_video.py my_session.webm \\
    --out validation/synthda/sequences/my_session.jsonl \\
    --label-reach 12.5

Models download to cv-service/models/ on first run (~15 MB each).
Requires opencv-python-headless (already in pyproject.toml).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.cv.types import Landmark
from validation.synthda.landmark_io import frame_to_line, write_frames
from validation.synthda.model_paths import ensure_models


def _make_pose_landmarker(model_path: Path) -> mp_vision.PoseLandmarker:
    options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return mp_vision.PoseLandmarker.create_from_options(options)


def _make_hand_landmarker(model_path: Path) -> mp_vision.HandLandmarker:
    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return mp_vision.HandLandmarker.create_from_options(options)


def extract(
    video_path: Path,
    *,
    max_frames: int | None = None,
    label_reach_cm: float | None = None,
    session_id: str | None = None,
) -> list[dict]:
    pose_path, hand_path = ensure_models()
    pose_lm = _make_pose_landmarker(pose_path)
    hand_lm = _make_hand_landmarker(hand_path)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f'Cannot open video: {video_path}')

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames: list[dict] = []
    idx = 0

    try:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            if max_frames is not None and idx >= max_frames:
                break

            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            pose_result = pose_lm.detect(mp_image)
            if not pose_result.pose_landmarks:
                idx += 1
                continue

            pose = [
                Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=lm.visibility)
                for lm in pose_result.pose_landmarks[0]
            ]

            hand_result = hand_lm.detect(mp_image)
            hands: list[list[Landmark]] | None = None
            if hand_result.hand_landmarks:
                hands = [
                    [Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=1.0) for lm in hand]
                    for hand in hand_result.hand_landmarks
                ]

            elapsed_ms = (idx / fps) * 1000.0
            meta: dict = {}
            if idx == 0:
                if label_reach_cm is not None:
                    meta['label_reach_cm'] = label_reach_cm
                if session_id:
                    meta['session_id'] = session_id

            import json
            row = json.loads(frame_to_line(elapsed_ms=elapsed_ms, pose=pose, hands=hands, **meta))
            frames.append(row)
            idx += 1
    finally:
        cap.release()
        pose_lm.close()
        hand_lm.close()

    return frames


def main() -> int:
    parser = argparse.ArgumentParser(description='Extract landmarks from video to JSONL.')
    parser.add_argument('video', type=Path, help='Input .mp4 / .webm / .mov')
    parser.add_argument('--out', type=Path, required=True, help='Output .jsonl path')
    parser.add_argument('--label-reach', type=float, help='Manual ruler reach (cm) for MAE/SynthDa label')
    parser.add_argument('--session', help='Session id metadata, e.g. sr-p01')
    parser.add_argument('--max-frames', type=int, help='Limit frames (quick test)')
    args = parser.parse_args()

    if not args.video.exists():
        print(f'Video not found: {args.video}')
        return 1

    frames = extract(
        args.video,
        max_frames=args.max_frames,
        label_reach_cm=args.label_reach,
        session_id=args.session,
    )
    if not frames:
        print('No pose detected in video. Check framing: sideways, full leg visible.')
        return 1

    write_frames(args.out, frames)
    print(f'Wrote {len(frames)} frames -> {args.out}')
    if args.label_reach is not None:
        print(f'  label_reach_cm={args.label_reach}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
