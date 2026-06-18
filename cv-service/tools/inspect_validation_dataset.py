from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from validation_common import load_manifest, write_json


@dataclass
class InspectionResult:
    video_path: str
    scenario: str
    opened: bool
    content_check_passed: bool
    reason: str | None
    fps: float
    frames_read: int
    width: int
    height: int
    duration_seconds: float | None
    global_pixel_min: int | None
    global_pixel_max: int | None
    mean_pixel_value: float | None
    std_pixel_value: float | None
    saved_sample_frames: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect validation videos from a manifest.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--sample-output-dir", required=True)
    return parser.parse_args()


def content_rule(scenario: str, duration: float | None, global_min: int, global_max: int, mean: float, std: float) -> tuple[bool, str | None]:
    if scenario == "black_no_person":
        return mean <= 2 and global_max <= 5, "Expected near-black frames."

    if scenario == "white_no_person":
        return mean >= 245 and global_min >= 240, "Expected near-white frames."

    if scenario == "random_noise":
        return std >= 40 and global_min <= 30 and global_max >= 220, "Expected high pixel variation."

    if scenario == "flicker_no_person":
        return std >= 80 and global_min <= 5 and global_max >= 245, "Expected black-white flicker."

    if scenario == "too_short_black":
        return duration is not None and duration <= 1.5 and mean <= 2, "Expected short near-black video."

    return False, f"No inspection rule for scenario={scenario}."


def inspect_video(video_path: Path, scenario: str, sample_output_dir: Path) -> InspectionResult:
    capture = cv2.VideoCapture(str(video_path))

    if not capture.isOpened():
        return InspectionResult(str(video_path), scenario, False, False, "OpenCV could not open video.", 0, 0, 0, 0, None, None, None, None, None, [])

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    sample_output_dir.mkdir(parents=True, exist_ok=True)
    sample_indices = {0, max(total_frames // 2, 0), max(total_frames - 1, 0)}

    frames_read = 0
    global_min = 255
    global_max = 0
    pixel_sum = 0.0
    pixel_square_sum = 0.0
    pixel_count = 0
    saved_samples: list[str] = []

    while True:
        ok, frame = capture.read()

        if not ok:
            break

        frame_index = frames_read
        frames_read += 1

        frame_float = frame.astype(np.float64)
        global_min = min(global_min, int(frame.min()))
        global_max = max(global_max, int(frame.max()))
        pixel_sum += float(frame_float.sum())
        pixel_square_sum += float((frame_float * frame_float).sum())
        pixel_count += int(frame.size)

        if frame_index in sample_indices:
            sample_path = sample_output_dir / f"{video_path.stem}_frame_{frame_index}.png"
            cv2.imwrite(str(sample_path), frame)
            saved_samples.append(str(sample_path))

    capture.release()

    if frames_read == 0 or pixel_count == 0:
        return InspectionResult(str(video_path), scenario, True, False, "Video opened but no frames were read.", fps, 0, width, height, None, None, None, None, None, saved_samples)

    mean = pixel_sum / pixel_count
    variance = max((pixel_square_sum / pixel_count) - (mean * mean), 0.0)
    std = variance ** 0.5
    duration = frames_read / fps if fps > 0 else None

    passed, reason = content_rule(scenario, duration, global_min, global_max, mean, std)

    return InspectionResult(
        video_path=str(video_path),
        scenario=scenario,
        opened=True,
        content_check_passed=passed,
        reason=None if passed else reason,
        fps=fps,
        frames_read=frames_read,
        width=width,
        height=height,
        duration_seconds=round(duration, 4) if duration is not None else None,
        global_pixel_min=global_min,
        global_pixel_max=global_max,
        mean_pixel_value=round(mean, 4),
        std_pixel_value=round(std, 4),
        saved_sample_frames=saved_samples,
    )


def main() -> None:
    args = parse_args()

    rows = load_manifest(Path(args.manifest))
    sample_output_dir = Path(args.sample_output_dir)

    results = [
        inspect_video(Path(row["video_path"]), row["scenario"], sample_output_dir)
        for row in rows
    ]

    report: dict[str, Any] = {
        "total_videos": len(results),
        "passed_content_checks": sum(result.content_check_passed for result in results),
        "failed_content_checks": sum(not result.content_check_passed for result in results),
        "results": [asdict(result) for result in results],
    }

    write_json(Path(args.output_json), report)
    print(json.dumps(report, indent=2))

    if report["failed_content_checks"] > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()