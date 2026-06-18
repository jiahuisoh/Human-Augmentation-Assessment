from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from validate_chair_stand_video import ValidationConfig, validate_config, validate_video
from validation_common import load_manifest, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run chair-stand validation against every video listed in a manifest.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--summary-json", required=True)
    parser.add_argument("--calibration-seconds", type=float, default=3.0)
    parser.add_argument("--max-test-seconds", type=float, default=30.0)
    return parser.parse_args()


def build_config(row: dict[str, str], output_dir: Path, calibration_seconds: float, max_test_seconds: float) -> ValidationConfig:
    video_path = Path(row["video_path"])
    video_stem = video_path.stem

    return ValidationConfig(
        video_path=video_path,
        expected_reps=int(row["expected_reps"]),
        expected_validity=row["expected_validity"],  # type: ignore[arg-type]
        scenario=row["scenario"],
        camera_angle=row.get("camera_angle", "unknown"),
        calibration_seconds=calibration_seconds,
        skip_after_calibration_seconds=0.0,
        max_test_seconds=max_test_seconds,
        user_age=70,
        user_sex="other",
        min_usable_frame_ratio=0.20,
        output_json=output_dir / f"{video_stem}_result.json",
        debug_csv=output_dir / f"{video_stem}_debug.csv",
    )


def main() -> None:
    args = parse_args()

    rows = load_manifest(Path(args.manifest))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    results = []

    for row in rows:
        config = build_config(row, output_dir, args.calibration_seconds, args.max_test_seconds)
        validate_config(config)
        result = validate_video(config)
        results.append(asdict(result))

    summary: dict[str, Any] = {
        "manifest": args.manifest,
        "total_tests": len(results),
        "passed_tests": sum(result["passed"] for result in results),
        "failed_tests": sum(not result["passed"] for result in results),
        "results": results,
    }

    write_json(Path(args.summary_json), summary)
    print(json.dumps(summary, indent=2))

    if summary["failed_tests"] > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()