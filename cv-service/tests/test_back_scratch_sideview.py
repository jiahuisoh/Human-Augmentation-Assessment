"""Side-on back-scratch: trunk-length calibration + hand-tracker-only measurement.

The face-on redesign fixed two sources of the jumpiness the test showed in
practice:
  - the pixel->cm ruler is now the trunk (shoulder->hip), which stays visible
    and steady side-on, instead of shoulder width, which foreshortens to near
    zero when the person turns;
  - the fingertip gap is read from the hand-tracker ONLY, never the pose model's
    inferred behind-the-back fingers, so the measurement no longer flips between
    two anatomical points that sit centimetres apart.
"""

import math

import pytest

from app.cv.landmarks import LANDMARK
from app.cv.types import Landmark
from app.tests.base import FinalizeContext
from app.tests.back_scratch.strategy import (
    SHOULDER_TO_HIP_FRACTION_OF_HEIGHT, _MAX_JUMP_CM, BackScratchStrategy,
)
from app.cv.hand_detector import HAND_LANDMARK

_HEIGHT_CM = 170.0


def _pose_with_trunk(trunk_norm: float):
    marks = [Landmark(0.0, 0.0, visibility=0.0) for _ in range(33)]
    marks[LANDMARK.RIGHT_SHOULDER] = Landmark(0.5, 0.2, visibility=1.0)
    marks[LANDMARK.RIGHT_HIP] = Landmark(0.5, 0.2 + trunk_norm, visibility=1.0)
    return marks


def _hand(tip_x: float, tip_y: float, wrist_y: float):
    h = [Landmark(0.5, 0.5, visibility=1.0) for _ in range(21)]
    h[HAND_LANDMARK.MIDDLE_FINGER_TIP] = Landmark(tip_x, tip_y, visibility=1.0)
    h[HAND_LANDMARK.WRIST] = Landmark(tip_x, wrist_y, visibility=1.0)
    return h


def _two_hands(gap_norm: float):
    """Upper hand (fingers pointing down) and lower hand (pointing up), a
    vertical `gap_norm` apart and not overlapping."""
    upper = _hand(0.5, 0.45, 0.40)          # tip below its wrist -> points down
    lower = _hand(0.5, 0.45 + gap_norm, 0.55 + gap_norm)  # tip above wrist -> up
    return [upper, lower]


def _calibrated() -> BackScratchStrategy:
    strategy = BackScratchStrategy()
    strategy.on_init(70, "male", _HEIGHT_CM)
    strategy.reset()
    for _ in range(4):
        strategy.on_calibration_frame(_pose_with_trunk(0.4))
    ok, reason = strategy.finish_calibration()
    assert ok, reason
    return strategy


class TestTrunkCalibration:
    def test_scale_comes_from_trunk_length_and_height(self) -> None:
        strategy = _calibrated()
        # trunk_cm / trunk_norm = (170 * 0.288) / 0.4
        expected = (_HEIGHT_CM * SHOULDER_TO_HIP_FRACTION_OF_HEIGHT) / 0.4
        assert strategy._cm_per_unit == pytest.approx(expected)

    def test_calibration_fails_without_a_visible_trunk(self) -> None:
        strategy = BackScratchStrategy()
        strategy.on_init(70, "male", _HEIGHT_CM)
        strategy.reset()
        # Only a shoulder, no hip -> trunk cannot be measured.
        bare = [Landmark(0.0, 0.0, visibility=0.0) for _ in range(33)]
        bare[LANDMARK.RIGHT_SHOULDER] = Landmark(0.5, 0.2, visibility=1.0)
        for _ in range(5):
            strategy.on_calibration_frame(bare)
        ok, reason = strategy.finish_calibration()
        assert not ok
        assert reason is not None and "upper body" in reason

    def test_calibration_fails_without_height(self) -> None:
        strategy = BackScratchStrategy()
        strategy.on_init(70, "male", None)
        strategy.reset()
        for _ in range(4):
            strategy.on_calibration_frame(_pose_with_trunk(0.4))
        ok, reason = strategy.finish_calibration()
        assert not ok
        assert reason is not None and "height" in reason.lower()


class TestHandTrackerOnly:
    def test_no_pose_fallback_when_hands_absent(self) -> None:
        strategy = _calibrated()
        pose = _pose_with_trunk(0.4)
        # Pose has wrists/pinkies visible, but with no hand landmarks the frame
        # must NOT be scored - the old pinky fallback is gone.
        pose[LANDMARK.LEFT_PINKY] = Landmark(0.4, 0.5, visibility=1.0)
        pose[LANDMARK.RIGHT_PINKY] = Landmark(0.6, 0.5, visibility=1.0)
        pose[LANDMARK.LEFT_WRIST] = Landmark(0.4, 0.55, visibility=1.0)
        pose[LANDMARK.RIGHT_WRIST] = Landmark(0.6, 0.55, visibility=1.0)
        strategy.update(pose, 100.0, hand_landmarks=None)
        assert strategy._frames_scored == 0

    def test_two_hands_produce_a_measurement(self) -> None:
        strategy = _calibrated()
        pose = _pose_with_trunk(0.4)
        for i in range(12):
            u = strategy.update(pose, i * 300.0, hand_landmarks=_two_hands(0.05))
        assert strategy._frames_scored >= 10
        assert u.measurement is not None


class TestOutlierRejection:
    def test_single_spike_is_dropped(self) -> None:
        strategy = _calibrated()
        pose = _pose_with_trunk(0.4)
        # Establish a steady reading.
        for i in range(6):
            strategy.update(pose, i * 300.0, hand_landmarks=_two_hands(0.05))
        steady = strategy._last_score_cm
        scored_before = strategy._frames_scored
        # One frame with a huge, implausible jump.
        big_gap = 0.05 + (_MAX_JUMP_CM * 3) / strategy._cm_per_unit
        after = strategy.update(pose, 1800.0, hand_landmarks=_two_hands(big_gap))
        # The spike is not scored and does not move the live reading.
        assert strategy._frames_scored == scored_before
        assert after.measurement == steady

    def test_a_sustained_move_is_accepted_after_one_frame(self) -> None:
        strategy = _calibrated()
        pose = _pose_with_trunk(0.4)
        for i in range(6):
            strategy.update(pose, i * 300.0, hand_landmarks=_two_hands(0.05))
        scored = strategy._frames_scored
        big_gap = 0.05 + (_MAX_JUMP_CM * 3) / strategy._cm_per_unit
        strategy.update(pose, 1800.0, hand_landmarks=_two_hands(big_gap))   # dropped
        strategy.update(pose, 2100.0, hand_landmarks=_two_hands(big_gap))   # confirmed
        assert strategy._frames_scored == scored + 1


class TestTracksOnHandsNotPose:
    def test_two_hands_track_even_with_no_pose(self) -> None:
        strategy = _calibrated()
        assert strategy.is_tracking(None, _two_hands(0.05)) is True

    def test_pose_without_hands_does_not_track(self) -> None:
        strategy = _calibrated()
        pose = _pose_with_trunk(0.4)  # shoulder + hip visible, but no hands
        assert strategy.is_tracking(pose, None) is False

    def test_one_hand_does_not_track(self) -> None:
        strategy = _calibrated()
        one = [Landmark(0.5, 0.5, visibility=1.0) for _ in range(21)]
        assert strategy.is_tracking(None, [one]) is False


class TestSignConventionSideOn:
    def test_gap_is_negative(self) -> None:
        strategy = _calibrated()
        upper, lower = _two_hands(0.05)
        cm = strategy._signed_score_cm(
            upper[HAND_LANDMARK.MIDDLE_FINGER_TIP], upper[HAND_LANDMARK.WRIST],
            lower[HAND_LANDMARK.MIDDLE_FINGER_TIP], lower[HAND_LANDMARK.WRIST],
        )
        assert cm < 0  # a gap between fingertips

    def test_hand_order_does_not_change_the_score(self) -> None:
        strategy = _calibrated()
        upper, lower = _two_hands(0.05)
        a = strategy._signed_score_cm(
            upper[HAND_LANDMARK.MIDDLE_FINGER_TIP], upper[HAND_LANDMARK.WRIST],
            lower[HAND_LANDMARK.MIDDLE_FINGER_TIP], lower[HAND_LANDMARK.WRIST],
        )
        b = strategy._signed_score_cm(
            lower[HAND_LANDMARK.MIDDLE_FINGER_TIP], lower[HAND_LANDMARK.WRIST],
            upper[HAND_LANDMARK.MIDDLE_FINGER_TIP], upper[HAND_LANDMARK.WRIST],
        )
        assert a == b
