const mongoose = require("mongoose");

const OverrideSchema = new mongoose.Schema({
  by:            { type: String, required: true },
  byRole:        { type: String, required: true },
  reason:        { type: String, required: true },
  originalScore: { type: Number, required: true },
  newScore:      { type: Number, required: true },
  at:            { type: String, default: () => new Date().toISOString() },
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  clientId:        { type: String, required: true, index: true },
  conductedBy:     { type: String, required: true },
  testId:          { type: String, enum: ["chair_stand","back_scratch","sit_reach"], required: true },
  reps:            { type: Number },
  measurement:     { type: Number },
  classification:  { type: String },
  riskLevel:       { type: String, enum: ["low","moderate","high"] },
  interpretation:  { type: String },
  normLow:         { type: Number },
  normHigh:        { type: Number },
  terminatedEarly: { type: Boolean, default: false },
  livenessScore:   { type: Number },
  recordHash:      { type: String },
  overrides:       [OverrideSchema],
}, { timestamps: true });

SessionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("AssessmentSession", SessionSchema);
