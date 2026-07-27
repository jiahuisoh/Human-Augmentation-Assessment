"""Chair-protocol sit-reach checks (planted foot + extended test leg)."""

from app.tests.base import FinalizeContext
from app.tests.sit_reach.strategy import SitReachStrategy, toe_line_landmark
from tests.helpers import chair_sit_reach_pose, hand_middle_finger_at, visible


def _calibrate_chair(strategy: SitReachStrategy, pose=None) -> None:
    pose = pose or chair_sit_reach_pose()
    for _ in range(4):
        strategy.on_calibration_frame(pose)
    ok, err = strategy.finish_calibration()
    assert ok, err


def _hold(strategy: SitReachStrategy, finger_x: float, pose=None, start_ms: float = 0.0) -> None:
    pose = pose or chair_sit_reach_pose(finger=(finger_x, 0.50))
    hands = hand_middle_finger_at(finger_x, 0.50)
    for i in range(14):
        strategy.update(pose, elapsed_ms=start_ms + (i + 1) * 250.0, hand_landmarks=hands)


class TestChairSitReach:
    def test_defaults_to_chair_seating(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "female", 164.0, "home")
        assert s._seating == "chair"
        assert "chair" in s.calibration_prompt.lower()

    def test_picks_extended_leg_even_if_planted_more_visible(self) -> None:
        pose = chair_sit_reach_pose(planted_brighter=True)
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        assert s._select_test_side(pose) == "right"

    def test_planted_bent_leg_does_not_fail_form(self) -> None:
        pose = chair_sit_reach_pose()
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        assert s._form_hint_for_seating(pose) is None

    def test_short_of_extended_toes_is_negative(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        _calibrate_chair(s)
        _hold(s, finger_x=0.70)
        assert s._all_reaches
        assert s._all_reaches[0] < 0

    def test_at_toe_line_near_zero(self) -> None:
        ankle = visible(0.70, 0.55)
        tip = visible(0.78, 0.55)
        line_x = toe_line_landmark(ankle, tip).x
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        _calibrate_chair(s)
        _hold(s, finger_x=line_x)
        assert s._all_reaches
        assert abs(s._all_reaches[0]) <= 1.5

    def test_past_toes_is_positive(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        _calibrate_chair(s)
        _hold(s, finger_x=0.90)
        assert s._all_reaches
        assert s._all_reaches[0] > 0

    def test_bent_test_leg_pauses_recording(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "clinic", "chair")
        good = chair_sit_reach_pose()
        _calibrate_chair(s, good)
        # Bend the extended (right) test knee.
        bent = chair_sit_reach_pose()
        from app.cv.landmarks import LANDMARK
        from app.cv.types import Landmark

        bent[LANDMARK.RIGHT_KNEE] = Landmark(0.50, 0.59, visibility=0.9)
        update = s.update(bent, elapsed_ms=2500.0, hand_landmarks=hand_middle_finger_at(0.88, 0.50))
        assert update.form_valid is False
        assert update.measurement is None

    def test_finalize_chair_mentions_protocol(self) -> None:
        s = SitReachStrategy()
        s.on_init(None, "male", 164.0, "home", "chair")
        _calibrate_chair(s)
        _hold(s, finger_x=0.90)
        outcome = s.finalize(FinalizeContext(user_age=25, user_sex="male", terminated_early=False))
        assert outcome.measurement is not None
        assert outcome.measurement > 0
        assert outcome.interpretation is not None
        assert "Chair" in outcome.interpretation
