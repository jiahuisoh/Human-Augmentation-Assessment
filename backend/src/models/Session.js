const mongoose = require("mongoose");
const crypto = require("crypto");
const { TEST_IDS, RISK_LEVELS, heightLimits } = require("../utils/constants");

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
  reps:            { type: Number, min: 0, max: 50 },
  measurement:     { type: Number, min: -100, max: 100 },
  timeTo5StandsS:  { type: Number, min: 0, max: 120 },
  classification:  { type: String, maxlength: 200 },
  riskLevel:       { type: String, enum: RISK_LEVELS },
  interpretation:  { type: String, maxlength: 1500 },
  normLow:         { type: Number, min: -100, max: 100 },
  normHigh:        { type: Number, min: -100, max: 100 },
  sppbStsPoints:   { type: Number, min: 0, max: 4 },
  awgs19SlowSts:   { type: Boolean },
  normApplicability: { type: String, enum: ["in_range", "extrapolated", "out_of_range"] },
  trafficLight:    { type: String, enum: ["red", "amber", "green"] },
  calibrationQuality: { type: Number, min: 0, max: 1 },
  needsQualityReview: { type: Boolean },
  kneeBent:           { type: Boolean },
  ageAtTest:       { type: Number, min: 0, max: 120 },
  sexAtTest:       { type: String, enum: ["male", "female", "other"] },
  heightAtTestCm:  { type: Number, min: heightLimits.min, max: heightLimits.max },
  terminatedEarly: { type: Boolean, default: false },
  livenessScore:   { type: Number },
  recordHash:      { type: String },
  cvNonce:         { type: String, unique: true, sparse: true },
  overrides:       [OverrideSchema],
}, { timestamps: true });

SessionSchema.index({ clientId: 1, createdAt: -1 });

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