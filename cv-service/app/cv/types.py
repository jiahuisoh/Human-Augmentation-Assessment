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
TrafficLight = Literal['red', 'amber', 'green']
NormApplicability = Literal['in_range', 'extrapolated', 'out_of_range']

class TestOutcome(BaseModel):
    reps: Optional[int] = None
    measurement: Optional[float] = None
    classification: Optional[str] = None
    risk_level: Optional[RiskLevel] = None
    interpretation: Optional[str] = None
    norm_low: Optional[float] = None
    norm_high: Optional[float] = None
    norm_applicability: Optional[NormApplicability] = None
    terminated_early: bool = False
    calibration_quality: Optional[float] = None
    # FFMOT at-home booklet Red/Amber/Green rating (sit_reach only). Shown
    # live; the backend re-derives its own from knee_offset_cm for storage.
    traffic_light: Optional[TrafficLight] = None
    # Knee position along the leg axis relative to the toes, in cm (negative:
    # the knee sits behind the toes). A raw geometric measurement, signed and
    # sent so the server can derive the traffic light itself.
    knee_offset_cm: Optional[float] = None
    # Protocol flag (sit_reach): the extended knee bent during the scored hold,
    # which invalidates the trial under the protocol. Recorded, never enforced -
    # a clinician decides whether the trial stands.
    knee_bent: Optional[bool] = None
    # Exploratory SPPB sit-to-stand derivation (chair_stand only) - see
    # app/tests/chair_stand/sppb.py for why this is not a scored SPPB subtest.
    time_to_5_stands_s: Optional[float] = None
    sppb_sts_points: Optional[int] = None
    awgs19_slow_sts: Optional[bool] = None

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
    knee_bent: Optional[bool] = None
    time_remaining: Optional[float] = None

class ReadyMessage(BaseModel):
    type: Literal['ready'] = 'ready'
    test_id: TestId

class CompleteMessage(BaseModel):
    type: Literal['complete'] = 'complete'
    outcome: TestOutcome
    # Signed raw measurements for the backend. The browser forwards this
    # verbatim; it cannot read or alter what is inside.
    outcome_token: Optional[str] = None

class ErrorMessage(BaseModel):
    type: Literal['error'] = 'error'
    message: str

class InitAction(BaseModel):
    action: Literal['init']
    # Backend-signed grant. The subject (age/sex/height) is read from inside it;
    # the browser does not get to state who it is testing.
    token: str

class StartAction(BaseModel):
    action: Literal['start']

class StopEarlyAction(BaseModel):
    action: Literal['stop_early']
