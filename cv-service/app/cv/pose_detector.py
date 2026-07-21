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
log = logging.getLogger('hana.cv.detector')

class PoseDetector:

    def __init__(self) -> None:
        self._landmarker: mp_vision.PoseLandmarker | None = None
        self._lock = threading.Lock()

    def init(self) -> None:
        with self._lock:
            if self._landmarker is not None:
                return
            model_path = Path(settings.pose_model_path)
            if not model_path.exists():
                raise FileNotFoundError(f'Pose model not found at {model_path}. Was it downloaded during Docker build?')
            log.info('Loading pose model: %s', model_path)
            options = mp_vision.PoseLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=str(model_path)), running_mode=mp_vision.RunningMode.IMAGE, num_poses=1, min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5, min_tracking_confidence=0.5)
            self._landmarker = mp_vision.PoseLandmarker.create_from_options(options)
            log.info('Pose model loaded.')

    def detect(self, rgb_image: np.ndarray) -> Sequence[Landmark] | None:
        with self._lock:
            if self._landmarker is None:
                raise RuntimeError('PoseDetector.init() must be called first')
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
            result = self._landmarker.detect(mp_image)
            if not result.pose_landmarks:
                return None
            return [Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=lm.visibility) for lm in result.pose_landmarks[0]]

    def close(self) -> None:
        with self._lock:
            if self._landmarker is not None:
                self._landmarker.close()
                self._landmarker = None
detector = PoseDetector()
