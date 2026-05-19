import math
from typing import Sequence
from app.cv.types import Landmark

class _OneEuroFilter:

    def __init__(self, min_cutoff: float, beta: float, d_cutoff: float=1.0) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x_prev: float | None = None
        self._dx_prev: float = 0.0
        self._last_time: float | None = None

    def reset(self) -> None:
        self._x_prev = None
        self._dx_prev = 0.0
        self._last_time = None

    def filter(self, x: float, timestamp_ms: float) -> float:
        if self._x_prev is None or self._last_time is None:
            self._x_prev = x
            self._last_time = timestamp_ms
            return x
        dt = (timestamp_ms - self._last_time) / 1000.0
        self._last_time = timestamp_ms
        if dt <= 0:
            return self._x_prev
        dx = (x - self._x_prev) / dt
        a_d = _alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self._dx_prev
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = _alpha(cutoff, dt)
        x_hat = a * x + (1 - a) * self._x_prev
        self._x_prev = x_hat
        self._dx_prev = dx_hat
        return x_hat

def _alpha(cutoff: float, dt_sec: float) -> float:
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt_sec)

class LandmarkSmoother:

    def __init__(self, min_cutoff: float=1.5, beta: float=0.05) -> None:
        self._filters: dict[str, _OneEuroFilter] = {}
        self._min_cutoff = min_cutoff
        self._beta = beta

    def reset(self) -> None:
        for f in self._filters.values():
            f.reset()

    def smooth(self, landmarks: Sequence[Landmark], timestamp_ms: float) -> list[Landmark]:
        out: list[Landmark] = []
        for i, lm in enumerate(landmarks):
            x = self._get(f'{i}_x').filter(lm.x, timestamp_ms)
            y = self._get(f'{i}_y').filter(lm.y, timestamp_ms)
            z = self._get(f'{i}_z').filter(lm.z, timestamp_ms)
            out.append(Landmark(x=x, y=y, z=z, visibility=lm.visibility))
        return out

    def _get(self, key: str) -> _OneEuroFilter:
        f = self._filters.get(key)
        if f is None:
            f = _OneEuroFilter(self._min_cutoff, self._beta)
            self._filters[key] = f
        return f
