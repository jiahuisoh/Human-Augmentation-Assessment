from dataclasses import dataclass
from typing import Literal, Optional
from pydantic import BaseModel

@dataclass(frozen=True)
class Landmark:
    x: float
    y: float
    z: float = 0.0
    visibility: float = 0.0
Sex = Literal['male', 'female', 'other']
TestId = Literal['chair_stand', 'back_scratch', 'sit_reach']
RiskLevel = Literal['low', 'moderate', 'high']
Phase = Literal['loading', 'calibrating', 'countdown', 'test', 'done', 'error']
Detection = Literal['ok', 'partial', 'missing']
Posture = Literal['up', 'down', 'unknown']

class TestOutcome(BaseModel):
    reps: Optional[int] = None
    measurement: Optional[float] = None
    classification: Optional[str] = None
    risk_level: Optional[RiskLevel] = None
    interpretation: Optional[str] = None
    norm_low: Optional[float] = None
    norm_high: Optional[float] = None
    terminated_early: bool = False
    calibration_quality: Optional[float] = None

class UpdateMessage(BaseModel):
    type: Literal['update'] = 'update'
    phase: Phase
    landmarks: Optional[list[list[float]]] = None
    hand_landmarks: Optional[list[list[list[float]]]] = None
    detection: Optional[Detection] = None
    calib_progress: Optional[float] = None
    calib_samples: Optional[int] = None
    calib_remaining_s: Optional[float] = None
    calib_quality: Optional[float] = None
    countdown: Optional[int] = None
    reps: Optional[int] = None
    posture: Optional[Posture] = None
    angle: Optional[float] = None
    measurement: Optional[float] = None
    best_measurement: Optional[float] = None
    time_remaining: Optional[float] = None

class ReadyMessage(BaseModel):
    type: Literal['ready'] = 'ready'
    test_id: TestId

class CompleteMessage(BaseModel):
    type: Literal['complete'] = 'complete'
    outcome: TestOutcome

class ErrorMessage(BaseModel):
    type: Literal['error'] = 'error'
    message: str

class InitAction(BaseModel):
    action: Literal['init']
    user_age: Optional[int] = None
    user_sex: Sex = 'other'
    user_height: Optional[float] = None

class StartAction(BaseModel):
    action: Literal['start']

class StopEarlyAction(BaseModel):
    action: Literal['stop_early']
