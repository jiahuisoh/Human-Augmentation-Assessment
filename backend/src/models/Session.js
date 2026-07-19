const mongoose = require("mongoose");
const crypto = require("crypto");
const { TEST_IDS, RISK_LEVELS } = require("../utils/constants");

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
  reps:            { type: Number, min: 0, max: 50 },
  measurement:     { type: Number, min: -100, max: 100 },
  classification:  { type: String, maxlength: 200 },
  riskLevel:       { type: String, enum: RISK_LEVELS },
  interpretation:  { type: String, maxlength: 1500 },
  normLow:         { type: Number, min: -100, max: 100 },
  normHigh:        { type: Number, min: -100, max: 100 },
  terminatedEarly: { type: Boolean, default: false },
  livenessScore:   { type: Number },
  recordHash:      { type: String },
  overrides:       [OverrideSchema],
}, { timestamps: true });

// Every read is a client's history newest-first: find({clientId}).sort({createdAt:-1}).
// Supersedes the standalone clientId index (clientId is the prefix).
SessionSchema.index({ clientId: 1, createdAt: -1 });

SessionSchema.pre("save", function (next) {
  if (!this.recordHash) {
    const payload = JSON.stringify({
      id: this._id.toString(), clientId: this.clientId, conductedBy: this.conductedBy,
      testId: this.testId, reps: this.reps ?? null, measurement: this.measurement ?? null,
      classification: this.classification ?? null, riskLevel: this.riskLevel ?? null,
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
