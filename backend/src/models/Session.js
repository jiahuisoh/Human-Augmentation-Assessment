const mongoose = require("mongoose");
const crypto = require("crypto");
const { TEST_IDS, RISK_LEVELS, heightLimits } = require("../utils/constants");

// Bounds mirror the route validator (routes/sessions.js) - defense in depth:
// the route rejects bad input with a clean 400, and the schema guarantees the
// same limits hold for any other write path that may be added later.
const OverrideSchema = new mongoose.Schema({
  by:            { type: String, required: true },
  byRole:        { type: String, enum: ["clinician", "administrator"], required: true },
  reason:        { type: String, required: true, maxlength: 1000 },
  originalScore: { type: Number, required: true, min: -100, max: 100 },
  newScore:      { type: Number, required: true, min: -100, max: 100 },
  at:            { type: String, default: () => new Date().toISOString() },
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  clientId:        { type: String, required: true },
  conductedBy:     { type: String, required: true },
  testId:          { type: String, enum: TEST_IDS, required: true },

  // Raw measurements - reported by the client that ran the test.
  reps:            { type: Number, min: 0, max: 50 },
  measurement:     { type: Number, min: -100, max: 100 },
  timeTo5StandsS:  { type: Number, min: 0, max: 120 },

  // Derived clinically - written only by utils/norms.js, never by the caller.
  classification:  { type: String, maxlength: 200 },
  riskLevel:       { type: String, enum: RISK_LEVELS },
  interpretation:  { type: String, maxlength: 1500 },
  normLow:         { type: Number, min: -100, max: 100 },
  normHigh:        { type: Number, min: -100, max: 100 },
  sppbStsPoints:   { type: Number, min: 0, max: 4 },
  awgs19SlowSts:   { type: Boolean },
  // Whether the age was actually covered by the Rikli & Jones tables (60-94),
  // stretched to reach it (55-59), or outside them entirely. A comparison the
  // source data does not support must never read like a published one.
  normApplicability: { type: String, enum: ["in_range", "extrapolated", "out_of_range"] },
  // FFMOT at-home Red/Amber/Green (sit_reach). Derived from the measurement
  // and the signed knee position - the client's chosen way to read this test.
  trafficLight:    { type: String, enum: ["red", "amber", "green"] },
  // How stable tracking was during calibration (0-1) and whether that makes
  // the reading untrustworthy. A low-quality result is still a record; it just
  // must not be read as if it were a clean one.
  calibrationQuality: { type: Number, min: 0, max: 1 },
  needsQualityReview: { type: Boolean },
  // Protocol flag: the extended knee bent during the scored sit-reach hold.
  kneeBent:           { type: Boolean },

  // Profile values as they were at test time. The norm band and the cm scale
  // both depend on these, so a later profile edit must not silently rewrite
  // what a historical result meant.
  ageAtTest:       { type: Number, min: 0, max: 120 },
  sexAtTest:       { type: String, enum: ["male", "female", "other"] },
  heightAtTestCm:  { type: Number, min: heightLimits.min, max: heightLimits.max },

  terminatedEarly: { type: Boolean, default: false },
  livenessScore:   { type: Number },
  recordHash:      { type: String },
  // The CV grant this result came from. Unique so the same signed outcome
  // cannot be replayed into a second record; sparse so records predating
  // signed outcomes (which have no nonce) do not all collide on null.
  cvNonce:         { type: String, unique: true, sparse: true },
  overrides:       [OverrideSchema],
}, { timestamps: true });

// Every read is a client's history newest-first: find({clientId}).sort({createdAt:-1}).
// Supersedes the standalone clientId index (clientId is the prefix).
SessionSchema.index({ clientId: 1, createdAt: -1 });

// Covers the derived verdict AND the inputs it was derived from, so a stored
// classification can be recomputed and checked later. Note this is a plain
// digest, not a signature or a chain: it detects accidental edits, and proves
// nothing against anyone who can also rewrite the hash.
SessionSchema.pre("save", function (next) {
  if (!this.recordHash) {
    const payload = JSON.stringify({
      id: this._id.toString(), clientId: this.clientId, conductedBy: this.conductedBy,
      testId: this.testId, reps: this.reps ?? null, measurement: this.measurement ?? null,
      timeTo5StandsS: this.timeTo5StandsS ?? null,
      classification: this.classification ?? null, riskLevel: this.riskLevel ?? null,
      ageAtTest: this.ageAtTest ?? null, sexAtTest: this.sexAtTest ?? null,
      heightAtTestCm: this.heightAtTestCm ?? null,
    });
    this.recordHash = "0x" + crypto.createHash("sha256").update(payload).digest("hex");
  }
  next();
});

SessionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("AssessmentSession", SessionSchema);
