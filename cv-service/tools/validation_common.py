from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


def load_manifest(manifest_path: Path) -> list[dict[str, str]]:
    """Load validation test cases from a CSV manifest."""
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest file not found: {manifest_path}")

    with manifest_path.open("r", newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def write_json(output_path: Path, payload: dict[str, Any]) -> None:
    """Write a JSON file, creating parent folders when needed."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def count_passed(items: list[dict[str, Any]], key: str) -> int:
    """Count how many result dictionaries have a truthy value for a given key."""
    return sum(1 for item in items if item.get(key))