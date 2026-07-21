"""Regression tests for the CV pipeline's concurrency and robustness fixes."""

import threading
import time
from types import SimpleNamespace

import numpy as np
import pytest

from app.api import websocket
from app.cv.hand_detector import HAND_LANDMARK, HandDetector
from app.cv.landmarks import LANDMARK, landmarks_to_wire
from app.cv.pose_detector import PoseDetector
from app.cv.types import Landmark
from app.tests.back_scratch.strategy import BackScratchStrategy
from app.tests.chair_stand.strategy import ChairStandStrategy


class _ConcurrencyTracker:
    """Records the highest number of threads seen inside detect() at once."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.inside = 0
        self.max_inside = 0

    def enter(self) -> None:
        with self._lock:
            self.inside += 1
            self.max_inside = max(self.max_inside, self.inside)

    def leave(self) -> None:
        with self._lock:
            self.inside -= 1


class _FakeLandmarker:
    def __init__(self, tracker: _ConcurrencyTracker, result_attr: str) -> None:
        self._tracker = tracker
        self._result_attr = result_attr

    def detect(self, _image):
        self._tracker.enter()
        time.sleep(0.01)  # wide enough for a racing thread to overlap
        self._tracker.leave()
        return SimpleNamespace(**{self._result_attr: []})

    def close(self) -> None:
        pass


def _rgb() -> np.ndarray:
    return np.zeros((16, 16, 3), dtype=np.uint8)


def _hammer(detector, threads: int = 8) -> None:
    image = _rgb()
    workers = [threading.Thread(target=lambda: detector.detect(image)) for _ in range(threads)]
    for w in workers:
        w.start()
    for w in workers:
        w.join()


class TestDetectorsAreThreadSafe:
    """One detector instance is shared by every WebSocket session, and each
    session calls detect() from a worker thread. MediaPipe landmarkers are not
    safe for concurrent use, so the lock must serialise them."""

    def test_pose_detector_serialises_concurrent_detects(self) -> None:
        tracker = _ConcurrencyTracker()
        detector = PoseDetector()
        detector._landmarker = _FakeLandmarker(tracker, "pose_landmarks")
        _hammer(detector)
        assert tracker.max_inside == 1

    def test_hand_detector_serialises_concurrent_detects(self) -> None:
        tracker = _ConcurrencyTracker()
        detector = HandDetector()
        detector._landmarker = _FakeLandmarker(tracker, "hand_landmarks")
        _hammer(detector)
        assert tracker.max_inside == 1


class TestFrameWorkIsSkippedWhenUnused:
    def test_hand_model_is_not_run_when_hands_are_not_wanted(self, monkeypatch) -> None:
        calls = {"pose": 0, "hands": 0}

        def fake_pose(_img):
            calls["pose"] += 1
            return None

        def fake_hands(_img):
            calls["hands"] += 1
            return None

        monkeypatch.setattr(websocket, "decode_jpeg", lambda _b: _rgb())
        monkeypatch.setattr(websocket.detector, "detect", fake_pose)
        monkeypatch.setattr(websocket.hand_detector, "detect", fake_hands)

        websocket.decode_and_detect(b"frame", want_hands=False)
        assert calls == {"pose": 1, "hands": 0}

        websocket.decode_and_detect(b"frame", want_hands=True)
        assert calls == {"pose": 2, "hands": 1}

    def test_undecodable_frame_runs_no_inference(self, monkeypatch) -> None:
        called = {"pose": 0}
        monkeypatch.setattr(websocket, "decode_jpeg", lambda _b: None)
        monkeypatch.setattr(websocket.detector, "detect", lambda _i: called.__setitem__("pose", 1))
        assert websocket.decode_and_detect(b"junk", want_hands=True) == (None, None, 1.0)
        assert called["pose"] == 0

    def test_only_measuring_phases_consume_frames(self) -> None:
        assert websocket.MEASURING_PHASES == frozenset({"calibrating", "countdown", "test"})
        for idle in ("loading", "done", "error"):
            assert idle not in websocket.MEASURING_PHASES


def _lm(x: float, y: float, vis: float) -> Landmark:
    return Landmark(x, y, visibility=vis)


def _both_legs(right_vis: float, left_vis: float, *, left_bent: bool) -> list[Landmark]:
    """Right leg always straight (180 deg); left optionally bent (90 deg)."""
    pose = [Landmark(0.0, 0.0, visibility=0.0) for _ in range(33)]
    pose[LANDMARK.RIGHT_HIP] = _lm(0.5, 0.2, right_vis)
    pose[LANDMARK.RIGHT_KNEE] = _lm(0.5, 0.5, right_vis)
    pose[LANDMARK.RIGHT_ANKLE] = _lm(0.5, 0.8, right_vis)
    pose[LANDMARK.LEFT_HIP] = _lm(0.4, 0.2, left_vis)
    pose[LANDMARK.LEFT_KNEE] = _lm(0.4, 0.5, left_vis)
    pose[LANDMARK.LEFT_ANKLE] = _lm(0.7, 0.5, left_vis) if left_bent else _lm(0.4, 0.8, left_vis)
    return pose


class TestChairStandLocksTheMeasuredLeg:
    def _calibrated_on_right(self) -> ChairStandStrategy:
        strategy = ChairStandStrategy()
        strategy.reset()
        for _ in range(5):
            strategy.on_calibration_frame(_both_legs(0.9, 0.4, left_bent=False))
        ok, _ = strategy.finish_calibration()
        assert ok
        assert strategy._locked_side == "right"
        return strategy

    def test_does_not_switch_legs_when_the_other_becomes_clearer(self) -> None:
        strategy = self._calibrated_on_right()
        # Left is now far more visible AND bent; the locked right leg is still
        # straight, so the angle must stay ~180 rather than jumping to ~90.
        angle = strategy._knee_angle(_both_legs(0.6, 0.99, left_bent=True))
        assert angle == pytest.approx(180.0, abs=1.0)

    def test_falls_back_when_the_locked_leg_is_occluded(self) -> None:
        strategy = self._calibrated_on_right()
        angle = strategy._knee_angle(_both_legs(0.0, 0.9, left_bent=True))
        assert angle == pytest.approx(90.0, abs=1.0)

    def test_returns_none_when_neither_leg_is_visible(self) -> None:
        strategy = self._calibrated_on_right()
        assert strategy._knee_angle(_both_legs(0.0, 0.0, left_bent=False)) is None


class TestBackScratchHandHandling:
    def test_truncated_hand_returns_none(self) -> None:
        strategy = BackScratchStrategy()
        strategy.reset()
        full = [Landmark(0.5, 0.5, visibility=1.0) for _ in range(21)]
        truncated = [Landmark(0.5, 0.5, visibility=1.0) for _ in range(5)]
        # A truncated hand must not IndexError out of the WebSocket handler;
        # the frame is simply not scored (no pose fallback exists any more).
        assert strategy._fingertips([full, truncated]) is None

    def test_one_hand_is_not_enough(self) -> None:
        strategy = BackScratchStrategy()
        strategy.reset()
        one = [Landmark(0.5, 0.5, visibility=1.0) for _ in range(21)]
        assert strategy._fingertips([one]) is None

    def test_two_full_hands_are_used(self) -> None:
        strategy = BackScratchStrategy()
        strategy.reset()
        hand_a = [Landmark(0.1, 0.1, visibility=1.0) for _ in range(21)]
        hand_b = [Landmark(0.2, 0.2, visibility=1.0) for _ in range(21)]
        hand_a[HAND_LANDMARK.MIDDLE_FINGER_TIP] = Landmark(0.3, 0.4, visibility=1.0)
        points = strategy._fingertips([hand_a, hand_b])
        assert points is not None
        assert points[0][0].x == pytest.approx(0.3)


class TestWirePayload:
    def test_coordinates_are_rounded_for_transport(self) -> None:
        wire = landmarks_to_wire([Landmark(0.123456789, 0.987654321, visibility=0.55555)])
        assert wire == [[0.1235, 0.9877, 0.556]]
