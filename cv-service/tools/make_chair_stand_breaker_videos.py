from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class BreakerVideoSpec:
    filename: str
    scenario: str
    duration_seconds: float
    mode: str
    expected_reps: int
    expected_validity: str
    camera_angle: str
    notes: str


BREAKER_SPECS = [
    BreakerVideoSpec("black_no_person_6s.mp4", "black_no_person", 6.0, "black", 0, "invalid_input", "none", "No visible person."),
    BreakerVideoSpec("white_no_person_6s.mp4", "white_no_person", 6.0, "white", 0, "invalid_input", "none", "Blank white frame."),
    BreakerVideoSpec("random_noise_6s.mp4", "random_noise", 6.0, "noise", 0, "invalid_input", "none", "Random visual noise."),
    BreakerVideoSpec("flicker_no_person_6s.mp4", "flicker_no_person", 6.0, "flicker", 0, "invalid_input", "none", "Alternating black and white frames."),
    BreakerVideoSpec("too_short_black_1s.mp4", "too_short_black", 1.0, "black", 0, "invalid_input", "none", "Too short for calibration."),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate controlled no-person breaker videos.")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--docker-path-prefix", default="/app/local_validation_videos/chair_stand")
    return parser.parse_args()


def make_frame(mode: str, frame_index: int, width: int, height: int, rng: np.random.Generator) -> np.ndarray:
    if mode == "black":
        return np.zeros((height, width, 3), dtype=np.uint8)

    if mode == "white":
        return np.full((height, width, 3), 255, dtype=np.uint8)

    if mode == "noise":
        return rng.integers(0, 256, size=(height, width, 3), dtype=np.uint8)

    if mode == "flicker":
        value = 0 if frame_index % 2 == 0 else 255
        return np.full((height, width, 3), value, dtype=np.uint8)

    raise ValueError(f"Unsupported breaker video mode: {mode}")


def write_video(output_path: Path, spec: BreakerVideoSpec, width: int, height: int, fps: int, rng: np.random.Generator) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )

    if not writer.isOpened():
        raise RuntimeError(f"Could not create video: {output_path}")

    for frame_index in range(int(spec.duration_seconds * fps)):
        writer.write(make_frame(spec.mode, frame_index, width, height, rng))

    writer.release()


def write_manifest(output_dir: Path, specs: list[BreakerVideoSpec], docker_path_prefix: str) -> None:
    manifest_path = output_dir / "breaker_manifest.csv"

    with manifest_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=["video_path", "expected_reps", "expected_validity", "scenario", "camera_angle", "notes"],
        )
        writer.writeheader()

        for spec in specs:
            writer.writerow(
                {
                    "video_path": f"{docker_path_prefix}/{spec.filename}",
                    "expected_reps": spec.expected_reps,
                    "expected_validity": spec.expected_validity,
                    "scenario": spec.scenario,
                    "camera_angle": spec.camera_angle,
                    "notes": spec.notes,
                }
            )


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    rng = np.random.default_rng(seed=42)

    for spec in BREAKER_SPECS:
        output_path = output_dir / spec.filename
        write_video(output_path, spec, args.width, args.height, args.fps, rng)
        print(f"Created {output_path}")

    write_manifest(output_dir, BREAKER_SPECS, args.docker_path_prefix)
    print(f"Created {output_dir / 'breaker_manifest.csv'}")


if __name__ == "__main__":
    main()