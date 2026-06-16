"""Shared helpers for CV strategy unit tests."""

from app.cv.hand_detector import HAND_LANDMARK
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


def hand_middle_finger_at(x: float, y: float) -> list[list[Landmark]]:
    """Single detected hand with only the middle fingertip placed at (x, y)."""
    hand = [Landmark(0.0, 0.0, visibility=_HIDDEN) for _ in range(21)]
    hand[HAND_LANDMARK.MIDDLE_FINGER_TIP] = visible(x, y)
    return [hand]


def sit_reach_side_pose(
    *,
    side: str = "right",
    hip: tuple[float, float] = (0.30, 0.50),
    knee: tuple[float, float] = (0.30, 0.70),
    ankle: tuple[float, float] = (0.30, 0.90),
    toe: tuple[float, float] = (0.55, 0.90),
    finger: tuple[float, float] = (0.65, 0.70),
) -> list[Landmark]:
    """Sideways sit-and-reach layout: straight leg along Y, reach extends in +X."""
    if side == "right":
        return make_pose(
            {
                LANDMARK.RIGHT_HIP: visible(*hip),
                LANDMARK.RIGHT_KNEE: visible(*knee),
                LANDMARK.RIGHT_ANKLE: visible(*ankle),
                LANDMARK.RIGHT_FOOT_INDEX: visible(*toe),
                LANDMARK.RIGHT_INDEX: visible(*finger),
            },
        )
    return make_pose(
        {
            LANDMARK.LEFT_HIP: visible(*hip),
            LANDMARK.LEFT_KNEE: visible(*knee),
            LANDMARK.LEFT_ANKLE: visible(*ankle),
            LANDMARK.LEFT_FOOT_INDEX: visible(*toe),
            LANDMARK.LEFT_INDEX: visible(*finger),
        },
    )
