import math
from typing import Sequence
import cv2
import numpy as np
from app.cv.types import Landmark
from app.config.settings import settings

class LANDMARK:
    NOSE = 0
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32

def angle_between(a: Landmark, b: Landmark, c: Landmark) -> float:
    bax, bay = (a.x - b.x, a.y - b.y)
    bcx, bcy = (c.x - b.x, c.y - b.y)
    dot = bax * bcx + bay * bcy
    mag = math.hypot(bax, bay) * math.hypot(bcx, bcy)
    if mag == 0:
        return 0.0
    cos = max(-1.0, min(1.0, dot / mag))
    return math.degrees(math.acos(cos))

def distance(a: Landmark, b: Landmark) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)

def avg_visibility(landmarks: Sequence[Landmark], indices: Sequence[int]) -> float:
    return sum((landmarks[i].visibility for i in indices)) / len(indices)

def all_visible(landmarks: Sequence[Landmark], indices: Sequence[int]) -> bool:
    return all((landmarks[i].visibility >= settings.min_landmark_visibility for i in indices))

def pick_better_side(landmarks: Sequence[Landmark], left: Sequence[int], right: Sequence[int]) -> tuple[str, float]:
    left_score = avg_visibility(landmarks, left)
    right_score = avg_visibility(landmarks, right)
    if right_score >= left_score:
        return ('right', right_score)
    return ('left', left_score)

def decode_jpeg(frame_bytes: bytes) -> np.ndarray | None:
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        return None
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

def apply_aspect(landmarks: Sequence[Landmark], aspect: float) -> list[Landmark]:
    """Convert MediaPipe's anisotropic coordinates into isotropic ones.

    MediaPipe divides x by image WIDTH and y by image HEIGHT, so on any
    non-square frame the same physical length yields a different number
    depending on its direction. Measuring a vertical distance with a scale
    calibrated on a horizontal one is then wrong by exactly W/H - 33% on a
    640x480 stream. Scaling x by W/H puts both axes in units of image height,
    after which plain hypot() and angles are geometrically valid.
    """
    if aspect == 1.0:
        return list(landmarks)
    return [Landmark(x=lm.x * aspect, y=lm.y, z=lm.z, visibility=lm.visibility) for lm in landmarks]


def landmarks_to_wire(landmarks: Sequence[Landmark], aspect: float=1.0) -> list[list[float]]:
    # Undoes apply_aspect: the overlay is drawn against a canvas sized in the
    # frame's own pixels, so the browser wants MediaPipe's original coordinates.
    return [[round(lm.x / aspect, 4), round(lm.y, 4), round(lm.visibility, 3)] for lm in landmarks]

def hands_to_wire(hands: Sequence[Sequence[Landmark]] | None, aspect: float=1.0) -> list[list[list[float]]] | None:
    if not hands:
        return None
    return [landmarks_to_wire(hand, aspect) for hand in hands]
