"""Ensure MediaPipe .task models exist for offline validation scripts."""

from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / 'models'

POSE_URL = (
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/'
    'pose_landmarker_full/float16/latest/pose_landmarker_full.task'
)
HAND_URL = (
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/'
    'hand_landmarker/float16/latest/hand_landmarker.task'
)


def _download(url: str, dest: Path) -> None:
    print(f'Downloading {dest.name}...')
    urllib.request.urlretrieve(url, dest)


def ensure_models() -> tuple[Path, Path]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    pose_path = MODELS_DIR / 'pose_landmarker_full.task'
    hand_path = MODELS_DIR / 'hand_landmarker.task'
    if not pose_path.exists():
        _download(POSE_URL, pose_path)
    if not hand_path.exists():
        _download(HAND_URL, hand_path)
    return pose_path, hand_path
