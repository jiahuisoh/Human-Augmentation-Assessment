import statistics
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Sequence
from app.cv.types import Detection, Landmark, Phase, Posture, Sex, TestId, TestOutcome

# Coefficient of variation mapped to quality 0.0. Clean tracking of a still
# subject gives CV ≈ 0.01–0.03; heavy jitter/occlusion approaches 0.15.
_QUALITY_CV_WORST = 0.15


def calibration_quality_from_samples(samples: Sequence[float]) -> float | None:
    """0–1 stability score from calibration samples: 1 − CV/CV_worst, clamped.

    CV (stdev/median) is scale-invariant, so the same formula works whether the
    samples are normalised lengths (shoulder/leg width) or angles in degrees.
    """
    if len(samples) < 2:
        return None
    median = statistics.median(samples)
    if median <= 0:
        return 0.0
    cv = statistics.pstdev(samples) / median
    return round(max(0.0, min(1.0, 1.0 - cv / _QUALITY_CV_WORST)), 2)


@dataclass
class TestStateUpdate:
    reps: int | None = None
    posture: Posture | None = None
    angle: float | None = None
    measurement: float | None = None
    best_measurement: float | None = None
    knee_bent: bool | None = None
    finished: bool = False

@dataclass
class FinalizeContext:
    user_age: int | None
    user_sex: Sex
    terminated_early: bool
HandPose = Sequence[Landmark]

class TestStrategy(ABC):
    test_id: TestId
    calibration_s: int
    countdown_s: int
    active_duration_s: int
    min_calibration_samples: int
    calibration_prompt: str
    requires_hands: bool = False

    @abstractmethod
    def reset(self) -> None:
        ...

    def on_init(self, user_age: int | None, user_sex: Sex, user_height: float | None) -> None:
        _ = (user_age, user_sex, user_height)

    @abstractmethod
    def is_frame_usable(self, landmarks: Sequence[Landmark]) -> bool:
        ...

    @abstractmethod
    def get_calibration_sample_count(self) -> int:
        ...

    @abstractmethod
    def on_calibration_frame(self, landmarks: Sequence[Landmark], hand_landmarks: Sequence[HandPose] | None=None) -> None:
        ...

    @abstractmethod
    def finish_calibration(self) -> tuple[bool, str | None]:
        ...

    @abstractmethod
    def update(self, landmarks: Sequence[Landmark], elapsed_ms: float, hand_landmarks: Sequence[HandPose] | None=None) -> TestStateUpdate:
        ...

    @abstractmethod
    def finalize(self, ctx: FinalizeContext) -> TestOutcome:
        ...

    def detection_for(self, landmarks: Sequence[Landmark] | None) -> Detection:
        if landmarks is None:
            return 'missing'
        return 'ok' if self.is_frame_usable(landmarks) else 'partial'

    def is_tracking(self, landmarks: Sequence[Landmark] | None, hand_landmarks: Sequence[HandPose] | None) -> bool:
        _ = hand_landmarks
        return landmarks is not None and self.is_frame_usable(landmarks)

    def smoother_config(self) -> tuple[float, float]:
        """One Euro filter (min_cutoff, beta) for pose landmark smoothing."""
        return (1.5, 0.05)

    def get_calibration_quality(self) -> float | None:
        """0–1 score after calibration; None if not yet calibrated."""
        return None
