from app.cv.types import TestId
from app.tests.base import TestStrategy
from app.tests.chair_stand.strategy import ChairStandStrategy
from app.tests.back_scratch.strategy import BackScratchStrategy
from app.tests.sit_reach.strategy import SitReachStrategy

def strategy_for(test_id: TestId) -> TestStrategy:
    if test_id == 'chair_stand':
        return ChairStandStrategy()
    if test_id == 'back_scratch':
        return BackScratchStrategy()
    if test_id == 'sit_reach':
        return SitReachStrategy()
    raise ValueError(f'No strategy implemented for test_id={test_id}')
