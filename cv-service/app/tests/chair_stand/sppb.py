"""Exploratory SPPB sit-to-stand derivation from the 30-second chair stand.

EXPLORATORY - NOT A SCORED SPPB SUBTEST. Read this before presenting the
numbers to anyone clinical.

The SPPB (Guralnik et al., NEJM 1994) sit-to-stand subtest asks the person to
stand up five times "as fast as possible" and then STOP, and scores the total
time 0-4. Our chair stand asks for as many reps as possible in 30 seconds, so
the person paces themselves for a longer effort. Nobody has established that
the first five stands of a 30-second test are equivalent to a standalone
five-repetition test, and the pacing difference plausibly makes our timing
slower. Treat the output as a screening indicator to be validated, not as an
SPPB score.

Scoring thresholds (Guralnik et al. 1994):
    4 points  <= 11.1 s
    3 points  11.2 - 13.6 s
    2 points  13.7 - 16.6 s
    1 point   > 16.6 s
    0 points  unable to complete five stands

The published bands leave a gap between 16.6 and 16.7 s from rounding to 0.1 s;
we treat anything above 16.6 s as 1 point so the scale is continuous.

AWGS19 (Chen et al. 2020, adopted by the Yishun study) uses >= 12 s on the
five-times sit-to-stand as one of three physical-performance criteria for
sarcopenia. Meeting it is NOT a diagnosis: AWGS19 also requires low muscle
mass, which this system cannot measure.
"""

AWGS19_SLOW_STS_SECONDS = 12.0

_POINT_THRESHOLDS: tuple[tuple[float, int], ...] = (
    (11.1, 4),
    (13.6, 3),
    (16.6, 2),
)


def sppb_sts_points(seconds: float | None) -> int:
    """0-4 points for the five-times sit-to-stand. None means unable -> 0."""
    if seconds is None:
        return 0
    for limit, points in _POINT_THRESHOLDS:
        if seconds <= limit:
            return points
    return 1


def meets_awgs19_slow_sts(seconds: float | None) -> bool:
    """True when the time meets the AWGS19 poor-physical-performance cut-off."""
    if seconds is None:
        return False
    return seconds >= AWGS19_SLOW_STS_SECONDS
