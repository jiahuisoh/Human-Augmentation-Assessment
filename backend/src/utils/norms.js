// Age/sex norm tables and outcome derivation.
//
// TRUST BOUNDARY: this module exists so the server never takes a clinical
// verdict from the browser. The client may report raw measurements (reps, cm,
// seconds); everything a clinician reads - classification, risk level,
// interpretation, the norm band - is computed HERE from the client's stored
// profile. Anything the caller sends for those fields is discarded in
// controllers/sessionController.js.
//
// MIRROR: these tables are a line-for-line port of the CV service's
// cv-service/app/tests/<test>/norms.py. If a band changes in one, it MUST
// change in the other or the number on screen will disagree with the number in
// the database. See the header comments in those files for full provenance.
//
// Source: Rikli & Jones, Senior Fitness Test Manual, 2nd ed. (2013),
// n = 7,183 community-dwelling adults aged 60-94. Each band is the published
// normal range = 25th-75th percentile (the middle 50%), flexibility values
// converted from inches at 2.54 cm/in.
//
// Convention: sit-reach + = past the toes; back-scratch + = fingers overlap.

// [minAge, maxAge, [maleLow, maleHigh], [femaleLow, femaleHigh]]
const CHAIR_STAND_BANDS = [
  [60, 64, [14, 19], [12, 17]],
  [65, 69, [12, 18], [11, 16]],
  [70, 74, [12, 17], [10, 15]],
  [75, 79, [11, 17], [10, 15]],
  [80, 84, [10, 15], [9, 14]],
  [85, 89, [8, 14], [8, 13]],
  [90, 94, [7, 12], [4, 11]],
];

// male 60-64 -2.5..4.0 in ... 90-94 -6.5..-0.5 in
// female 60-64 -0.5..5.0 in ... 90-94 -4.5..1.0 in
const SIT_REACH_BANDS = [
  [60, 64, [-6.4, 10.2], [-1.3, 12.7]],
  [65, 69, [-7.6, 7.6], [-1.3, 11.4]],
  [70, 74, [-8.9, 6.4], [-2.5, 10.2]],
  [75, 79, [-10.2, 5.1], [-3.8, 8.9]],
  [80, 84, [-14.0, 3.8], [-5.1, 7.6]],
  [85, 89, [-14.0, 1.3], [-6.4, 6.4]],
  [90, 94, [-16.5, -1.3], [-11.4, 2.5]],
];

// male 60-64 -6.5..0.0 in ... 90-94 -10.5..-4.0 in
// female 60-64 -3.0..1.5 in ... 90-94 -8.0..-1.0 in
const BACK_SCRATCH_BANDS = [
  [60, 64, [-16.5, 0.0], [-7.6, 3.8]],
  [65, 69, [-19.1, -2.5], [-8.9, 3.8]],
  [70, 74, [-20.3, -2.5], [-10.2, 2.5]],
  [75, 79, [-22.9, -5.1], [-12.7, 1.3]],
  [80, 84, [-24.1, -5.1], [-14.0, 0.0]],
  [85, 89, [-25.4, -7.6], [-17.8, -2.5]],
  [90, 94, [-26.7, -10.2], [-20.3, -2.5]],
];

// How far a band may be stretched past its source data. Mirrors
// cv-service/app/tests/applicability.py - change both or the classification
// shown on screen stops matching the one written to the database.
//   in_range      60-94, the published band.
//   extrapolated  55-59, compared against 60-64 and flagged as approximate.
//   out_of_range  under 55 / over 94, no band applies.
// Silently clamping a 45-year-old into the 60-64 band flatters them against a
// reference three decades older, so it is treated as not classifiable instead.
const NORM_MIN_AGE = 60;
const NORM_MAX_AGE = 94;
const EXTRAPOLATION_MIN_AGE = 55;
const NOT_CLASSIFIABLE = "Not classifiable against Rikli & Jones norms";
const OUT_OF_RANGE_INTERPRETATION =
  "The reference tables for this test cover ages 60 to 94, so there is no " +
  "published range to compare this score against. The measurement itself is " +
  "still valid - a clinician should interpret it.";
const EXTRAPOLATED_NOTE =
  "Note: the reference tables start at age 60, so this has been compared " +
  "against the 60-64 range as the nearest available. Treat it as indicative.";

const applicabilityFor = (age) => {
  if (typeof age !== "number") return null;
  if (age >= EXTRAPOLATION_MIN_AGE && age < NORM_MIN_AGE) return "extrapolated";
  if (age >= NORM_MIN_AGE && age <= NORM_MAX_AGE) return "in_range";
  return "out_of_range";
};

const pickBand = (bands, age) => {
  if (age <= bands[0][0]) return bands[0];
  if (age >= bands[bands.length - 1][1]) return bands[bands.length - 1];
  return bands.find(b => age >= b[0] && age <= b[1]) || bands[0];
};

// "other"/unknown sex widens to the union of both bands rather than guessing.
const rangeFor = (bands, age, sex) => {
  const band = pickBand(bands, age);
  const [, , male, female] = band;
  if (sex === "male") return male;
  if (sex === "female") return female;
  return [Math.min(male[0], female[0]), Math.max(male[1], female[1])];
};

// The band is the middle 50% of healthy older adults, so a quarter of them fall
// below it by construction. Below-band is a prompt to train, not evidence of
// risk: "high" is reserved for validated cut-offs (see AWGS19 below).
const banded = (value, normLow, normHigh, texts, applicability) => {
  let result;
  if (value < normLow) {
    result = { classification: "Below Average", riskLevel: "moderate", interpretation: texts.below, normLow, normHigh };
  } else if (value > normHigh) {
    result = { classification: "Above Average", riskLevel: "low", interpretation: texts.above, normLow, normHigh };
  } else {
    result = { classification: "Average", riskLevel: "low", interpretation: texts.average, normLow, normHigh };
  }
  result.normApplicability = applicability;
  if (applicability === "extrapolated") {
    result.interpretation = `${result.interpretation} ${EXTRAPOLATED_NOTE}`;
  }
  return result;
};

// No band applies: keep the raw score, drop the verdict, say why.
const notClassifiable = () => ({
  classification: NOT_CLASSIFIABLE,
  interpretation: OUT_OF_RANGE_INTERPRETATION,
  normApplicability: "out_of_range",
});

const classifyWith = (bands, value, age, sex, texts) => {
  const applicability = applicabilityFor(age);
  if (applicability === null) return null;
  if (applicability === "out_of_range") return notClassifiable();
  const [low, high] = rangeFor(bands, age, sex);
  return banded(value, low, high, texts, applicability);
};

const CHAIR_STAND_TEXT = {
  below:   "Your score is below the middle 50% of people your age. Around a quarter of healthy adults score here. A lower-body strength programme would help.",
  above:   "Excellent lower-body strength for your age group.",
  average: "Within the typical range for your age. Regular strength exercises will help maintain or improve it.",
};

const SIT_REACH_TEXT = {
  below:   "Your reach is shorter than the middle 50% of people your age. Around a quarter of healthy adults score here. Regular hamstring and lower-back stretches will help.",
  above:   "Excellent lower-body flexibility for your age group.",
  average: "Within the typical range for your age. Daily stretches will help maintain it.",
};

const BACK_SCRATCH_TEXT = {
  below:   "Your reach is shorter than the middle 50% of people your age. Around a quarter of healthy adults score here. Daily shoulder and chest stretches can help.",
  above:   "Excellent shoulder flexibility for your age group.",
  average: "Within the typical range for your age. Stretch regularly to maintain it.",
};

const classifyChairStand = (reps, age, sex) => classifyWith(CHAIR_STAND_BANDS, reps, age, sex, CHAIR_STAND_TEXT);

const classifySitReach = (cm, age, sex) => classifyWith(SIT_REACH_BANDS, cm, age, sex, SIT_REACH_TEXT);

const classifyBackScratch = (cm, age, sex) => classifyWith(BACK_SCRATCH_BANDS, cm, age, sex, BACK_SCRATCH_TEXT);

// ── FFMOT at-home traffic light (sit-reach) ──────────────────────────────────
// Mirrors traffic_light_for_reach in cv-service/app/tests/sit_reach/norms.py.
//   green  Position 3: hands reach the toes or beyond.
//   amber  Position 2: hands reach between the knee and the toes.
//   red    Position 1: hands cannot get beyond the knee.
// kneeOffsetCm is the knee's position along the leg axis relative to the toes,
// so it is normally negative. Null when the knee was never visible: red and
// amber cannot be told apart without it, and guessing would invent a result.
const trafficLightForReach = (cm, kneeOffsetCm) => {
  if (typeof cm !== "number") return undefined;
  if (cm >= 0) return "green";
  if (typeof kneeOffsetCm !== "number") return undefined;
  return cm > kneeOffsetCm ? "amber" : "red";
};

// Below this, tracking was too unstable to trust the centimetre reading.
// cv-service/validation/PROTOCOL.md: exclude from MAE or flag for review.
const MIN_TRUSTWORTHY_CALIBRATION = 0.5;

// ── SPPB sit-to-stand (exploratory) ──────────────────────────────────────────
// Guralnik et al. 1994 thresholds. EXPLORATORY: the first five stands of a
// paced 30-second max-rep test are not validated as equivalent to a standalone
// five-repetition test. Never present this as a scored SPPB subtest.
const AWGS19_SLOW_STS_SECONDS = 12.0;
const SPPB_STS_STANDS = 5;

const sppbStsPoints = (seconds) => {
  if (typeof seconds !== "number") return 0; // unable to complete five stands
  if (seconds <= 11.1) return 4;
  if (seconds <= 13.6) return 3;
  if (seconds <= 16.6) return 2;
  return 1;
};

const meetsAwgs19SlowSts = (seconds) =>
  typeof seconds === "number" && seconds >= AWGS19_SLOW_STS_SECONDS;

// Whole years, or null when the date of birth is missing/unparseable. Age drives
// the norm band, so a bad value must yield "no classification", never a guess.
const ageFrom = (dateOfBirth) => {
  if (typeof dateOfBirth !== "string" || dateOfBirth.trim() === "") return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
};

const SEXES = ["male", "female", "other"];
const normaliseSex = (gender) => (SEXES.includes(gender) ? gender : "other");

const scoreFor = (testId, { reps, measurement }) =>
  testId === "chair_stand" ? reps : measurement;

/**
 * Derive every clinician-facing field from raw measurements + stored profile.
 * Returns only derived fields; the caller merges them over the raw values.
 * Age null (no/invalid date of birth) means no norm band applies, so the
 * session is stored with its raw score and no classification.
 */
const deriveOutcome = ({ testId, reps, measurement, timeTo5StandsS, kneeOffsetCm, calibrationQuality, kneeBent, age, sex }) => {
  const derived = {};

  // Protocol observation from the CV service: the extended knee bent during
  // the scored hold, which voids the trial under the protocol. Stored so a
  // clinician can judge it; never used to auto-reject the measurement.
  if (typeof kneeBent === "boolean") derived.kneeBent = kneeBent;

  if (typeof calibrationQuality === "number") {
    derived.calibrationQuality = calibrationQuality;
    // A verdict about the measurement's trustworthiness, not about the client.
    derived.needsQualityReview = calibrationQuality < MIN_TRUSTWORTHY_CALIBRATION;
  }

  if (testId === "sit_reach") {
    const light = trafficLightForReach(measurement, kneeOffsetCm);
    if (light) derived.trafficLight = light;
  }

  if (testId === "chair_stand") {
    // Raw timing is client-reported like reps; the points, the flag and any
    // risk escalation are decided here.
    if (typeof timeTo5StandsS === "number") {
      derived.timeTo5StandsS = timeTo5StandsS;
      derived.sppbStsPoints = sppbStsPoints(timeTo5StandsS);
      derived.awgs19SlowSts = meetsAwgs19SlowSts(timeTo5StandsS);
    } else if (typeof reps === "number" && reps < SPPB_STS_STANDS) {
      // A full 30 s elapsed without five stands (early stops are never saved),
      // so five would have taken longer than 30 s.
      derived.sppbStsPoints = 0;
      derived.awgs19SlowSts = true;
    }
  }

  // classifyWith decides for itself whether a band applies to this age, so
  // there is no age gate here: it returns null for unknown age and a
  // "not classifiable" result outside 55-94.
  const score = scoreFor(testId, { reps, measurement });
  if (typeof score === "number") {
    let band = null;
    if (testId === "chair_stand")  band = classifyChairStand(score, age, sex);
    if (testId === "sit_reach")    band = classifySitReach(score, age, sex);
    if (testId === "back_scratch") band = classifyBackScratch(score, age, sex);
    if (band) Object.assign(derived, band);
  }

  // Only a validated cut-off may read as high risk.
  if (derived.awgs19SlowSts) {
    derived.riskLevel = "high";
    const note = typeof derived.timeTo5StandsS === "number"
      ? `Five stands took ${derived.timeTo5StandsS}s, which meets a screening threshold (AWGS19, 12s or more) for reduced physical performance.`
      : "Fewer than five stands were completed in 30 seconds, which the SPPB scores as 0.";
    const caveat = "This is a screening indicator, not a diagnosis - a clinician should review.";
    derived.interpretation = [derived.interpretation, note, caveat].filter(Boolean).join(" ");
  }

  return derived;
};

module.exports = {
  ageFrom,
  normaliseSex,
  deriveOutcome,
  trafficLightForReach,
  MIN_TRUSTWORTHY_CALIBRATION,
  sppbStsPoints,
  meetsAwgs19SlowSts,
  classifyChairStand,
  classifySitReach,
  classifyBackScratch,
  AWGS19_SLOW_STS_SECONDS,
};
