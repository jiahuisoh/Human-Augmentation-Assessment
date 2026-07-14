const mongoose = require("mongoose");

// ── Measurement ───────────────────────────────────────────────────────────────
const MeasurementSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  height:   { type: Number, required: true },
  weight:   { type: Number, required: true },
  bmi:      { type: Number, required: true },
}, { timestamps: true });

// find({clientId}).sort({createdAt:-1}) — supersedes a standalone clientId index.
MeasurementSchema.index({ clientId: 1, createdAt: -1 });

MeasurementSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

// ── AIRecommendation ──────────────────────────────────────────────────────────
const AIRecommendationSchema = new mongoose.Schema({
  clientId:       { type: String, required: true, index: true },
  title:          { type: String, required: true },
  detail:         { type: String, required: true },
  confidence:     { type: Number, required: true },
  basis:          { type: String, required: true },
  status:         { type: String, enum: ["pending","approved","overridden"], default: "pending" },
  reviewedBy:     { type: String },
  overrideReason: { type: String },
  assignedTo:     { type: String },
}, { timestamps: true });

// A clinician's pending queue: find({assignedTo, status:"pending"}).
AIRecommendationSchema.index({ assignedTo: 1, status: 1 });

AIRecommendationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

// ── InterventionPlan ──────────────────────────────────────────────────────────
const PlanItemSchema = new mongoose.Schema({
  activity:  { type: String, required: true },
  frequency: { type: String, required: true },
  duration:  { type: String },
  done:      { type: Boolean, default: false },
}, { _id: false });

const InterventionPlanSchema = new mongoose.Schema({
  clientId:   { type: String, required: true },
  authoredBy: { type: String, required: true },
  items:      [PlanItemSchema],
}, { timestamps: true });

// Latest plan for a client: findOne({clientId}).sort({createdAt:-1}).
InterventionPlanSchema.index({ clientId: 1, createdAt: -1 });

InterventionPlanSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  obj.updatedAt = obj.updatedAt.toISOString();
  return obj;
};

// ── ScheduleEntry ─────────────────────────────────────────────────────────────
// time field added to match frontend ScheduleEntry type
const ScheduleEntrySchema = new mongoose.Schema({
  clientId:     { type: String, required: true },
  clientName:   { type: String, required: true },
  testId:       { type: String, enum: ["chair_stand","back_scratch","sit_reach"], required: true },
  time:         { type: String }, // e.g. "09:00" — matches frontend ScheduleEntry.time
  status:       { type: String, enum: ["scheduled","present","absent","in_progress","completed","pending_nric"], default: "scheduled" },
  nricVerified: { type: Boolean, default: false },
  date:         { type: String, required: true }, // YYYY-MM-DD for today filtering
}, { timestamps: true });

// The staff dashboard loads find({date: today}) on every visit; date was unindexed.
ScheduleEntrySchema.index({ date: 1 });

ScheduleEntrySchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

// ── QuestionnaireSubmission ───────────────────────────────────────────────────
const QuestionnaireSubmissionSchema = new mongoose.Schema({
  clientId:    { type: String, required: true },
  answers:     { type: mongoose.Schema.Types.Mixed, required: true },
  submittedAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

// find({clientId}).sort({submittedAt:-1}) — supersedes a standalone clientId index.
QuestionnaireSubmissionSchema.index({ clientId: 1, submittedAt: -1 });

QuestionnaireSubmissionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

module.exports = {
  Measurement:             mongoose.model("Measurement", MeasurementSchema),
  AIRecommendation:        mongoose.model("AIRecommendation", AIRecommendationSchema),
  InterventionPlan:        mongoose.model("InterventionPlan", InterventionPlanSchema),
  ScheduleEntry:           mongoose.model("ScheduleEntry", ScheduleEntrySchema),
  QuestionnaireSubmission: mongoose.model("QuestionnaireSubmission", QuestionnaireSubmissionSchema),
};
