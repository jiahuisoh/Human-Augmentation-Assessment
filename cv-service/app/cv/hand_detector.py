import logging
import threading
from pathlib import Path
from typing import Sequence
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from app.cv.types import Landmark
from app.config.settings import settings
log = logging.getLogger('hana.cv.hands')

class HAND_LANDMARK:
    WRIST = 0
    THUMB_TIP = 4
    INDEX_FINGER_TIP = 8
    MIDDLE_FINGER_TIP = 12
    RING_FINGER_TIP = 16
    PINKY_TIP = 20
HandPose = Sequence[Landmark]

class HandDetector:

    def __init__(self) -> None:
        self._landmarker: mp_vision.HandLandmarker | None = None
        self._lock = threading.Lock()

    def init(self) -> None:
        with self._lock:
            if self._landmarker is not None:
                return
            model_path = Path(settings.hand_model_path)
            if not model_path.exists():
                raise FileNotFoundError(f'Hand model not found at {model_path}. Was it downloaded during Docker build?')
            log.info('Loading hand model: %s', model_path)
            options = mp_vision.HandLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=str(model_path)), running_mode=mp_vision.RunningMode.IMAGE, num_hands=2, min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5, min_tracking_confidence=0.5)
            self._landmarker = mp_vision.HandLandmarker.create_from_options(options)
            log.info('Hand model loaded.')

    def detect(self, rgb_image: np.ndarray) -> Sequence[HandPose] | None:
        with self._lock:
            if self._landmarker is None:
                raise RuntimeError('HandDetector.init() must be called first')
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
            result = self._landmarker.detect(mp_image)
            if not result.hand_landmarks:
                return None
            return [[Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=1.0) for lm in hand] for hand in result.hand_landmarks]

    def close(self) -> None:
        with self._lock:
            if self._landmarker is not None:
                self._landmarker.close()
                self._landmarker = None
hand_detector = HandDetector()
