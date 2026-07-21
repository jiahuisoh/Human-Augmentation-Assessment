"""The backend re-derives clinical verdicts from its own copy of the norm
tables (backend/src/utils/norms.js) so the browser cannot dictate them. Two
copies of the same clinical thresholds is a drift hazard: if one side is
corrected and the other is not, the classification shown on screen stops
matching the one written to the database.

This test compares the two implementations directly. It is skipped when Node or
the backend checkout is unavailable, so cv-service can still be tested alone.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.tests.back_scratch.norms import classify_back_scratch
from app.tests.chair_stand.norms import classify_chair_stand
from app.tests.chair_stand.sppb import meets_awgs19_slow_sts, sppb_sts_points
from app.tests.sit_reach.norms import classify_sit_reach, traffic_light_for_reach

_BACKEND_NORMS = Path(__file__).resolve().parents[2] / "backend" / "src" / "utils" / "norms.js"

_CLASSIFIERS = {
    "chair_stand": classify_chair_stand,
    "sit_reach": classify_sit_reach,
    "back_scratch": classify_back_scratch,
}

_EMITTER = """
const n = require(%s);
const C = {
  chair_stand: n.classifyChairStand,
  sit_reach: n.classifySitReach,
  back_scratch: n.classifyBackScratch,
};
const r = v => Math.round(v * 1000) / 1000;
const bands = [];
for (const test of Object.keys(C)) {
  const fn = C[test];
  const step = test === "chair_stand" ? 1 : 0.1;
  for (let age = 40; age <= 105; age++) {
    for (const sex of ["male", "female", "other"]) {
      const base = fn(0, age, sex);
      const applicability = base.normApplicability;
      if (applicability === "out_of_range") {
        bands.push({ test, age, sex, normLow: null, normHigh: null, applicability,
          results: [[0, base.classification, base.riskLevel ?? null]] });
        continue;
      }
      const { normLow, normHigh } = base;
      const probes = [r(normLow - step), normLow, r((normLow + normHigh) / 2), normHigh, r(normHigh + step)];
      bands.push({ test, age, sex, normLow, normHigh, applicability,
        results: probes.map(p => { const x = fn(p, age, sex); return [p, x.classification, x.riskLevel ?? null]; }) });
    }
  }
}
const sppb = [];
for (let s = 0; s <= 300; s++) { const sec = r(s / 10); sppb.push([sec, n.sppbStsPoints(sec), n.meetsAwgs19SlowSts(sec)]); }
const lights = [];
for (const knee of [-40, -25.5, -10, null]) {
  for (let c = -600; c <= 200; c += 5) {
    const cm = r(c / 10);
    lights.push([cm, knee, n.trafficLightForReach(cm, knee) ?? null]);
  }
}
process.stdout.write(JSON.stringify({ bands, sppb, lights }));
"""


def _backend_behaviour() -> dict:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed; cannot compare against the backend tables")
    if not _BACKEND_NORMS.exists():
        pytest.skip(f"backend norms not found at {_BACKEND_NORMS}")
    script = _EMITTER % json.dumps(_BACKEND_NORMS.as_posix())
    result = subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def backend() -> dict:
    return _backend_behaviour()


def test_norm_bands_match_the_backend(backend: dict) -> None:
    mismatches = []
    for row in backend["bands"]:
        classify = _CLASSIFIERS[row["test"]]
        here = classify(0, row["age"], row["sex"])
        assert here is not None
        if here.norm_applicability != row["applicability"]:
            mismatches.append(
                f'{row["test"]} age={row["age"]}: applicability '
                f'cv={here.norm_applicability} backend={row["applicability"]}'
            )
            continue
        if row["applicability"] == "out_of_range":
            if (here.norm_low, here.norm_high) != (None, None):
                mismatches.append(f'{row["test"]} age={row["age"]}: cv kept a band out of range')
            continue
        if (round(here.norm_low, 3), round(here.norm_high, 3)) != (round(row["normLow"], 3), round(row["normHigh"], 3)):
            mismatches.append(
                f'{row["test"]} age={row["age"]} sex={row["sex"]}: '
                f'cv=({here.norm_low}, {here.norm_high}) backend=({row["normLow"]}, {row["normHigh"]})'
            )
    assert not mismatches, "norm bands have drifted:\n" + "\n".join(mismatches[:20])


def test_classifications_match_the_backend(backend: dict) -> None:
    mismatches = []
    for row in backend["bands"]:
        classify = _CLASSIFIERS[row["test"]]
        for value, backend_class, backend_risk in row["results"]:
            here = classify(value, row["age"], row["sex"])
            assert here is not None
            if (here.classification, here.risk_level) != (backend_class, backend_risk):
                mismatches.append(
                    f'{row["test"]} age={row["age"]} sex={row["sex"]} value={value}: '
                    f'cv=({here.classification}, {here.risk_level}) '
                    f'backend=({backend_class}, {backend_risk})'
                )
    assert not mismatches, "classifications have drifted:\n" + "\n".join(mismatches[:20])


def test_traffic_light_matches_the_backend(backend: dict) -> None:
    """The FFMOT Red/Amber/Green is shown live by the CV service and derived
    independently by the backend for storage. They must agree, or the colour on
    screen is not the colour in the record."""
    mismatches = []
    for cm, knee, backend_light in backend["lights"]:
        here = traffic_light_for_reach(cm, knee)
        if here != backend_light:
            mismatches.append(f"cm={cm} knee={knee}: cv={here} backend={backend_light}")
    assert not mismatches, "traffic light has drifted:\n" + "\n".join(mismatches[:20])


def test_sppb_derivation_matches_the_backend(backend: dict) -> None:
    mismatches = []
    for seconds, backend_points, backend_flag in backend["sppb"]:
        if sppb_sts_points(seconds) != backend_points:
            mismatches.append(f"{seconds}s points: cv={sppb_sts_points(seconds)} backend={backend_points}")
        if meets_awgs19_slow_sts(seconds) != backend_flag:
            mismatches.append(f"{seconds}s AWGS19: cv={meets_awgs19_slow_sts(seconds)} backend={backend_flag}")
    assert not mismatches, "SPPB derivation has drifted:\n" + "\n".join(mismatches[:20])
