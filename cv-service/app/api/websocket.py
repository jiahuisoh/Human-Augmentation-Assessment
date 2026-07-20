import asyncio
import json
import logging
import time
from typing import Sequence
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.cv.landmarks import decode_jpeg, landmarks_to_wire, hands_to_wire
from app.cv.landmark_smoother import LandmarkSmoother
from app.cv.pose_detector import detector
from app.cv.hand_detector import hand_detector
from app.cv.types import CompleteMessage, ErrorMessage, Landmark, ReadyMessage, TestOutcome, UpdateMessage
from app.tests.base import FinalizeContext, TestStrategy
from app.tests.strategies import strategy_for
router = APIRouter()
log = logging.getLogger('vitalage.cv.ws')

def _now_ms() -> float:
    return time.monotonic() * 1000.0

@router.websocket('/ws/test/{test_id}')
async def websocket_test(websocket: WebSocket, test_id: str) -> None:
    if test_id not in ('chair_stand', 'back_scratch', 'sit_reach'):
        await websocket.close(code=4400, reason=f'Unknown test_id: {test_id}')
        return
    try:
        strategy = strategy_for(test_id)
    except ValueError as exc:
        await websocket.close(code=4501, reason=str(exc))
        return
    await websocket.accept()
    log.info('WS connected: test_id=%s', test_id)
    try:
        session = _Session(websocket=websocket, strategy=strategy, test_id=test_id)
        await session.run()
    except WebSocketDisconnect:
        log.info('WS disconnected: test_id=%s', test_id)
    except Exception:
        log.exception('WS error: test_id=%s', test_id)
        try:
            await websocket.send_json(ErrorMessage(message='Internal server error').model_dump())
            await websocket.close(code=1011)
        except Exception:
            pass

class _Session:

    def __init__(self, websocket: WebSocket, strategy: TestStrategy, test_id: str) -> None:
        self.ws = websocket
        self.strategy = strategy
        self.test_id = test_id
        self.smoother = LandmarkSmoother()
        self.phase: str = 'loading'
        self.phase_start_ms: float = _now_ms()
        self.user_age: int | None = None
        self.user_sex: str = 'other'
        self.user_height: float | None = None
        self.environment: str = 'home'

    async def run(self) -> None:
        await self.ws.send_json(ReadyMessage(test_id=self.test_id).model_dump())
        while True:
            msg = await self.ws.receive()
            if msg.get('type') == 'websocket.disconnect':
                break
            text = msg.get('text')
            if text is not None:
                await self._handle_text(text)
                continue
            data = msg.get('bytes')
            if data is not None:
                await self._handle_frame(data)
                if self.phase == 'done':
                    break

    async def _handle_text(self, text: str) -> None:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return
        action = payload.get('action')
        if action == 'init':
            self.user_age = payload.get('user_age')
            self.user_sex = payload.get('user_sex', 'other')
            self.user_height = payload.get('user_height')
            self.environment = payload.get('environment', 'home')
            log.info('init: user_age=%s sex=%s height=%s environment=%s', self.user_age, self.user_sex, self.user_height, self.environment)
            self.strategy.on_init(self.user_age, self.user_sex, self.user_height, self.environment)
        elif action == 'start':
            self._goto_phase('calibrating')
            self.strategy.reset()
            mc, beta = self.strategy.smoother_config()
            self.smoother = LandmarkSmoother(min_cutoff=mc, beta=beta)
        elif action == 'stop_early':
            await self._finalize(terminated_early=True)

    async def _handle_frame(self, frame_bytes: bytes) -> None:
        rgb = decode_jpeg(frame_bytes)
        if rgb is None:
            return
        raw = await asyncio.to_thread(detector.detect, rgb)
        hands = None
        if self.strategy.requires_hands:
            hands = await asyncio.to_thread(hand_detector.detect, rgb)
        now = _now_ms()
        landmarks = self.smoother.smooth(raw, now) if raw is not None else None
        await self._tick(landmarks, hands, now)

    async def _tick(self, landmarks: Sequence[Landmark] | None, hand_landmarks: Sequence[Sequence[Landmark]] | None, now_ms: float) -> None:
        elapsed_ms = now_ms - self.phase_start_ms
        detection = self.strategy.detection_for(landmarks)
        usable = landmarks is not None and self.strategy.is_frame_usable(landmarks)
        if self.phase == 'calibrating':
            form_hint = self.strategy.form_hint_for(landmarks, self.phase)
            if usable and landmarks is not None:
                self.strategy.on_calibration_frame(landmarks, hand_landmarks)
            calib_ms = self.strategy.calibration_s * 1000
            progress = min(1.0, elapsed_ms / calib_ms)
            remaining = max(0.0, self.strategy.calibration_s - elapsed_ms / 1000)
            await self._send_update(
                landmarks=landmarks,
                hand_landmarks=hand_landmarks,
                detection=detection,
                calib_progress=round(progress, 2),
                calib_samples=self.strategy.get_calibration_sample_count(),
                calib_remaining_s=round(remaining, 2),
                calib_quality=self.strategy.get_calibration_quality(),
                form_hint=form_hint,
            )
            if elapsed_ms >= calib_ms and self.strategy.get_calibration_sample_count() >= self.strategy.min_calibration_samples:
                ok, reason = self.strategy.finish_calibration()
                if not ok:
                    await self.ws.send_json(ErrorMessage(message=reason or 'Calibration failed').model_dump())
                    self._goto_phase('error')
                else:
                    self._goto_phase('countdown')
        elif self.phase == 'countdown':
            remaining = self.strategy.countdown_s - elapsed_ms / 1000
            countdown = max(0, int(remaining + 1) if remaining > 0 else 0)
            await self._send_update(landmarks=landmarks, hand_landmarks=hand_landmarks, detection=detection, countdown=countdown)
            if remaining <= -0.5:
                self._goto_phase('test')
        elif self.phase == 'test':
            remaining = self.strategy.active_duration_s - elapsed_ms / 1000
            if usable and landmarks is not None:
                u = self.strategy.update(landmarks, elapsed_ms, hand_landmarks)
                await self._send_update(landmarks=landmarks, hand_landmarks=hand_landmarks, detection=detection, reps=u.reps, posture=u.posture, angle=u.angle, measurement=u.measurement, best_measurement=u.best_measurement, raw_measurement=u.raw_measurement, form_hint=u.form_hint, form_valid=u.form_valid, hold_progress=u.hold_progress, recording_status=u.recording_status, time_remaining=max(0.0, round(remaining, 2)))
                if u.finished or remaining <= 0:
                    await self._finalize(terminated_early=False)
            else:
                await self._send_update(landmarks=landmarks, hand_landmarks=hand_landmarks, detection=detection, time_remaining=max(0.0, round(remaining, 2)))
                if remaining <= 0:
                    await self._finalize(terminated_early=False)

    async def _send_update(self, *, landmarks: Sequence[Landmark] | None, hand_landmarks: Sequence[Sequence[Landmark]] | None=None, **fields) -> None:
        wire_pose = landmarks_to_wire(landmarks) if landmarks is not None else None
        wire_hands = hands_to_wire(hand_landmarks)
        msg = UpdateMessage(phase=self.phase, landmarks=wire_pose, hand_landmarks=wire_hands, **fields)
        await self.ws.send_json(msg.model_dump(exclude_none=True))

    async def _finalize(self, terminated_early: bool) -> None:
        ctx = FinalizeContext(user_age=self.user_age, user_sex=self.user_sex, terminated_early=terminated_early)
        outcome: TestOutcome = self.strategy.finalize(ctx)
        self._goto_phase('done')
        await self.ws.send_json(CompleteMessage(outcome=outcome).model_dump())

    def _goto_phase(self, next_phase: str) -> None:
        log.info('phase: %s → %s', self.phase, next_phase)
        self.phase = next_phase
        self.phase_start_ms = _now_ms()
