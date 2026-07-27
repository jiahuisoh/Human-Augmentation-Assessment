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
    """Single detected hand with fingertip landmarks placed at (x, y)."""
    hand = [Landmark(0.0, 0.0, visibility=_HIDDEN) for _ in range(21)]
    tip = visible(x, y)
    hand[HAND_LANDMARK.INDEX_FINGER_TIP] = tip
    hand[HAND_LANDMARK.MIDDLE_FINGER_TIP] = tip
    hand[HAND_LANDMARK.RING_FINGER_TIP] = tip
    hand[HAND_LANDMARK.PINKY_TIP] = tip
    return [hand]


def sit_reach_side_pose(
    *,
    side: str = "right",
    hip: tuple[float, float] = (0.30, 0.55),
    knee: tuple[float, float] = (0.50, 0.55),
    ankle: tuple[float, float] = (0.70, 0.55),
    toe: tuple[float, float] = (0.78, 0.55),
    finger: tuple[float, float] = (0.88, 0.50),
) -> list[Landmark]:
    """True side-view sit-and-reach: straight leg along +X, reach continues past toes."""
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


def chair_sit_reach_pose(
    *,
    test_side: str = "right",
    finger: tuple[float, float] = (0.88, 0.50),
    planted_brighter: bool = True,
) -> list[Landmark]:
    """Chair protocol: one planted (bent) foot + one extended test leg."""
    planted_vis = 0.99 if planted_brighter else 0.70
    test_vis = 0.70 if planted_brighter else 0.99

    def lm(x: float, y: float, vis: float) -> Landmark:
        return Landmark(x, y, visibility=vis)

    # Planted left: bent, closer. Extended right: straight along +X.
    planted = {
        LANDMARK.LEFT_HIP: lm(0.32, 0.55, planted_vis),
        LANDMARK.LEFT_KNEE: lm(0.40, 0.68, planted_vis),
        LANDMARK.LEFT_ANKLE: lm(0.38, 0.82, planted_vis),
        LANDMARK.LEFT_FOOT_INDEX: lm(0.40, 0.84, planted_vis),
    }
    extended = {
        LANDMARK.RIGHT_HIP: lm(0.30, 0.55, test_vis),
        LANDMARK.RIGHT_KNEE: lm(0.50, 0.55, test_vis),
        LANDMARK.RIGHT_ANKLE: lm(0.70, 0.55, test_vis),
        LANDMARK.RIGHT_FOOT_INDEX: lm(0.78, 0.55, test_vis),
        LANDMARK.RIGHT_INDEX: lm(finger[0], finger[1], test_vis),
    }
    if test_side == "left":
        # Mirror: planted right, extended left.
        planted = {
            LANDMARK.RIGHT_HIP: lm(0.32, 0.55, planted_vis),
            LANDMARK.RIGHT_KNEE: lm(0.40, 0.68, planted_vis),
            LANDMARK.RIGHT_ANKLE: lm(0.38, 0.82, planted_vis),
            LANDMARK.RIGHT_FOOT_INDEX: lm(0.40, 0.84, planted_vis),
        }
        extended = {
            LANDMARK.LEFT_HIP: lm(0.30, 0.55, test_vis),
            LANDMARK.LEFT_KNEE: lm(0.50, 0.55, test_vis),
            LANDMARK.LEFT_ANKLE: lm(0.70, 0.55, test_vis),
            LANDMARK.LEFT_FOOT_INDEX: lm(0.78, 0.55, test_vis),
            LANDMARK.LEFT_INDEX: lm(finger[0], finger[1], test_vis),
        }
    return make_pose({**planted, **extended})
