import asyncio
import json
import logging
import time
from typing import Sequence
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.cv.landmarks import apply_aspect, decode_jpeg, landmarks_to_wire, hands_to_wire
from app.cv.landmark_smoother import LandmarkSmoother
from app.cv.pose_detector import detector
from app.cv.hand_detector import hand_detector
from app.cv.types import CompleteMessage, ErrorMessage, Landmark, ReadyMessage, TestOutcome, UpdateMessage
from app.config.settings import settings
from app.security.tokens import TokenError, sign, verify
from app.tests.base import FinalizeContext, TestStrategy
from app.tests.strategies import strategy_for
router = APIRouter()
log = logging.getLogger('hana.cv.ws')

# Phases that actually consume frames. Anything else (loading before `start`,
# error, done) must not pay for inference.
MEASURING_PHASES = frozenset({'calibrating', 'countdown', 'test'})

def now_ms() -> float:
    return time.monotonic() * 1000.0

def decode_and_detect(frame_bytes: bytes, want_hands: bool) -> tuple[Sequence[Landmark] | None, Sequence[Sequence[Landmark]] | None, float]:
    """Decode + inference, run together on one worker thread.

    JPEG decoding is CPU-bound; doing it on the event loop stalled every other
    session's socket. Pairing it with detection also halves the thread hops per
    frame. The frame's aspect ratio comes back too: MediaPipe's coordinates are
    anisotropic and every measurement depends on correcting for it.
    """
    rgb = decode_jpeg(frame_bytes)
    if rgb is None:
        return (None, None, 1.0)
    height, width = rgb.shape[0], rgb.shape[1]
    aspect = (width / height) if height else 1.0
    pose = detector.detect(rgb)
    hands = hand_detector.detect(rgb) if want_hands else None
    return (pose, hands, aspect)

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
        self.phase_start_ms: float = now_ms()
        self.user_age: int | None = None
        self.user_sex: str = 'other'
        self.user_height: float | None = None
        # Set only by a verified `init`; nothing measures until it is present.
        self.grant: dict | None = None
        # Frame width/height, learned from the first decoded frame.
        self.aspect: float = 1.0

    async def run(self) -> None:
        await self.ws.send_json(ReadyMessage(test_id=self.test_id).model_dump())
        while True:
            msg = await self.ws.receive()
            if msg.get('type') == 'websocket.disconnect':
                break
            text = msg.get('text')
            if text is not None:
                await self._handle_text(text)
                if self.phase == 'done':  # stop_early finalizes via this path
                    break
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
            # Only before the test starts: re-init later could swap the grant
            # (and with it the subject) under a session already in progress.
            if self.phase != 'loading':
                log.warning('ignored init in phase=%s', self.phase)
                return
            # The subject comes from the backend-signed grant, never from the
            # browser: age and sex choose the norm band and height sets the
            # centimetre scale, so letting the caller supply them would let
            # anyone pick an easier result.
            try:
                grant = verify(payload.get('token'), 'cv_grant')
            except TokenError as exc:
                log.warning('rejected grant: %s', exc)
                await self.ws.send_json(ErrorMessage(message='This assessment session is not authorised or has expired. Please start the test again.').model_dump())
                self._goto_phase('error')
                return
            if grant.get('tid') != self.test_id:
                await self.ws.send_json(ErrorMessage(message='This authorisation is for a different assessment.').model_dump())
                self._goto_phase('error')
                return
            self.grant = grant
            self.user_age = grant.get('age')
            self.user_sex = grant.get('sex') or 'other'
            self.user_height = grant.get('height')
            log.info('init: grant=%s sandbox=%s', grant.get('jti'), grant.get('sandbox'))
            self.strategy.on_init(self.user_age, self.user_sex, self.user_height)
        elif action == 'start':
            # A duplicate start mid-test would reset the strategy and wipe the
            # reps counted so far.
            if self.phase != 'loading':
                log.warning('ignored start in phase=%s', self.phase)
                return
            if self.grant is None:
                await self.ws.send_json(ErrorMessage(message='This assessment session is not authorised. Please start the test again.').model_dump())
                self._goto_phase('error')
                return
            self._goto_phase('calibrating')
            self.strategy.reset()
            mc, beta = self.strategy.smoother_config()
            self.smoother = LandmarkSmoother(min_cutoff=mc, beta=beta)
        elif action == 'stop_early':
            # After done/error there is nothing to stop; a second finalize
            # would emit a second CompleteMessage.
            if self.phase not in MEASURING_PHASES:
                log.warning('ignored stop_early in phase=%s', self.phase)
                return
            await self._finalize(terminated_early=True)

    async def _handle_frame(self, frame_bytes: bytes) -> None:
        if self.phase not in MEASURING_PHASES:
            await self._send_update(landmarks=None)
            return

        want_hands = self.strategy.requires_hands and self.phase == 'test'
        raw, hands, aspect = await asyncio.to_thread(decode_and_detect, frame_bytes, want_hands)
        now = now_ms()
        self.aspect = aspect
        # Smooth in MediaPipe's own space (the filter is tuned there), then move
        # into isotropic units so distances and angles mean what they say.
        smoothed = self.smoother.smooth(raw, now) if raw is not None else None
        landmarks = apply_aspect(smoothed, aspect) if smoothed is not None else None
        hand_landmarks = [apply_aspect(hand, aspect) for hand in hands] if hands else None
        await self._tick(landmarks, hand_landmarks, now)

    async def _tick(self, landmarks: Sequence[Landmark] | None, hand_landmarks: Sequence[Sequence[Landmark]] | None, now_ms: float) -> None:
        elapsed_ms = now_ms - self.phase_start_ms
        detection = self.strategy.detection_for(landmarks)
        usable = landmarks is not None and self.strategy.is_frame_usable(landmarks)
        if self.phase == 'calibrating':
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
            tracking = self.strategy.is_tracking(landmarks, hand_landmarks)
            test_detection = 'ok' if tracking else ('missing' if landmarks is None else 'partial')
            if tracking:
                u = self.strategy.update(landmarks, elapsed_ms, hand_landmarks)
                await self._send_update(landmarks=landmarks, hand_landmarks=hand_landmarks, detection=test_detection, reps=u.reps, posture=u.posture, angle=u.angle, measurement=u.measurement, best_measurement=u.best_measurement, knee_bent=u.knee_bent, time_remaining=max(0.0, round(remaining, 2)))
                if u.finished or remaining <= 0:
                    await self._finalize(terminated_early=False)
            else:
                await self._send_update(landmarks=landmarks, hand_landmarks=hand_landmarks, detection=test_detection, time_remaining=max(0.0, round(remaining, 2)))
                if remaining <= 0:
                    await self._finalize(terminated_early=False)

    async def _send_update(self, *, landmarks: Sequence[Landmark] | None, hand_landmarks: Sequence[Sequence[Landmark]] | None=None, **fields) -> None:
        wire_pose = landmarks_to_wire(landmarks, self.aspect) if landmarks is not None else None
        wire_hands = hands_to_wire(hand_landmarks, self.aspect)
        msg = UpdateMessage(phase=self.phase, landmarks=wire_pose, hand_landmarks=wire_hands, **fields)
        await self.ws.send_json(msg.model_dump(exclude_none=True))

    async def _finalize(self, terminated_early: bool) -> None:
        ctx = FinalizeContext(user_age=self.user_age, user_sex=self.user_sex, terminated_early=terminated_early)
        outcome: TestOutcome = self.strategy.finalize(ctx)
        outcome.calibration_quality = self.strategy.get_calibration_quality()
        self._goto_phase('done')
        await self.ws.send_json(CompleteMessage(outcome=outcome, outcome_token=self._sign_outcome(outcome, terminated_early)).model_dump())

    def _sign_outcome(self, outcome: TestOutcome, terminated_early: bool) -> str | None:
        """Sign the raw measurements so the backend can trust what it stores.

        Only the numbers we measured are signed. The classification travels
        unsigned for live display: the backend re-derives it from the client's
        stored profile and never reads ours.
        """
        if self.grant is None:
            return None
        return sign('cv_outcome', {
            'jti': self.grant.get('jti'),
            'cid': self.grant.get('cid'),
            'tid': self.test_id,
            'sandbox': bool(self.grant.get('sandbox')),
            'reps': outcome.reps,
            'measurement': outcome.measurement,
            't5': outcome.time_to_5_stands_s,
            # Geometry and tracking quality: raw inputs the server needs to
            # derive the FFMOT traffic light and to flag a shaky calibration
            # for clinician review. Signed, because both change how a stored
            # result should be read.
            'knee': outcome.knee_offset_cm,
            'calq': outcome.calibration_quality,
            'knee_bent': outcome.knee_bent,
            'early': terminated_early,
        }, settings.outcome_ttl_seconds)

    def _goto_phase(self, next_phase: str) -> None:
        log.info('phase: %s → %s', self.phase, next_phase)
        self.phase = next_phase
        self.phase_start_ms = now_ms()
