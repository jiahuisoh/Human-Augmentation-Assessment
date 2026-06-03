"""Shared helpers for CV strategy unit tests."""

from app.cv.landmarks import LANDMARK
from app.cv.types import Landmark

_POSE_LANDMARK_COUNT = 33
_VISIBLE = 0.9
_HIDDEN = 0.0


def make_pose(overrides: dict[int, Landmark] | None = None) -> list[Landmark]:
    """Build a 33-landmark pose; override specific joint indices as needed."""
    landmarks = [Landmark(0.0, 0.0, visibility=_HIDDEN) for _ in range(_POSE_LANDMARK_COUNT)]
    for index, landmark in (overrides or {}).items():
        landmarks[index] = landmark
    return landmarks


def visible(x: float, y: float, z: float = 0.0) -> Landmark:
    return Landmark(x, y, z, visibility=_VISIBLE)


def sit_reach_side_pose(
    *,
    side: str = "right",
    hip: tuple[float, float] = (0.30, 0.50),
    ankle: tuple[float, float] = (0.30, 0.90),
    toe: tuple[float, float] = (0.55, 0.90),
    finger: tuple[float, float] = (0.65, 0.70),
) -> list[Landmark]:
    """Sideways sit-and-reach layout: leg along Y, reach extends in +X."""
    if side == "right":
        return make_pose(
            {
                LANDMARK.RIGHT_HIP: visible(*hip),
                LANDMARK.RIGHT_ANKLE: visible(*ankle),
                LANDMARK.RIGHT_FOOT_INDEX: visible(*toe),
                LANDMARK.RIGHT_INDEX: visible(*finger),
            },
        )
    return make_pose(
        {
            LANDMARK.LEFT_HIP: visible(*hip),
            LANDMARK.LEFT_ANKLE: visible(*ankle),
            LANDMARK.LEFT_FOOT_INDEX: visible(*toe),
            LANDMARK.LEFT_INDEX: visible(*finger),
        },
    )
