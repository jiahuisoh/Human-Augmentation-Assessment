const mongoose = require("mongoose");

// ── Measurement ──────────────────────────────────────────────────────────────
const MeasurementSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  height:   { type: Number, required: true },
  weight:   { type: Number, required: true },
  bmi:      { type: Number, required: true },
}, { timestamps: true });

MeasurementSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

// ── AIRecommendation ─────────────────────────────────────────────────────────
const AIRecommendationSchema = new mongoose.Schema({
  clientId:       { type: String, required: true, index: true },
  title:          { type: String, required: true },
  detail:         { type: String, required: true },
  confidence:     { type: Number, required: true },
  basis:          { type: String, required: true },
  status:         { type: String, enum: ["pending","approved","overridden"], default: "pending" },
  reviewedBy:     { type: String },
  overrideReason: { type: String },
  assignedTo:     { type: String }, // clinician ID
}, { timestamps: true });

AIRecommendationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

// ── InterventionPlan ─────────────────────────────────────────────────────────
const PlanItemSchema = new mongoose.Schema({
  activity:  { type: String, required: true },
  frequency: { type: String, required: true },
  duration:  { type: String },
  done:      { type: Boolean, default: false },
}, { _id: false });

const InterventionPlanSchema = new mongoose.Schema({
  clientId:   { type: String, required: true, index: true },
  authoredBy: { type: String, required: true },
  items:      [PlanItemSchema],
}, { timestamps: true });

InterventionPlanSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  obj.updatedAt = obj.updatedAt.toISOString();
  return obj;
};

// ── ScheduleEntry ────────────────────────────────────────────────────────────
const ScheduleEntrySchema = new mongoose.Schema({
  clientId:    { type: String, required: true },
  clientName:  { type: String, required: true },
  testId:      { type: String, enum: ["chair_stand","back_scratch","sit_reach"], required: true },
  status:      { type: String, enum: ["scheduled","present","absent","in_progress","completed","pending_nric"], default: "scheduled" },
  nricVerified:{ type: Boolean, default: false },
  date:        { type: String, required: true }, // ISO date string YYYY-MM-DD
}, { timestamps: true });

ScheduleEntrySchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

// ── SmartContract ────────────────────────────────────────────────────────────
const SmartContractSchema = new mongoose.Schema({
  name:               { type: String, required: true },
  version:            { type: String, required: true },
  status:             { type: String, enum: ["live","staging","deprecated"], default: "staging" },
  env:                { type: String, enum: ["production","sandbox"], default: "sandbox" },
  deployedAt:         { type: String },
  needsAdminApproval: { type: Boolean, default: true },
  requestedBy:        { type: String },
  approvedBy:         { type: String },
}, { timestamps: true });

SmartContractSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

// ── QuestionnaireSubmission ──────────────────────────────────────────────────
const QuestionnaireSubmissionSchema = new mongoose.Schema({
  clientId:    { type: String, required: true, index: true },
  answers:     { type: mongoose.Schema.Types.Mixed, required: true },
  submittedAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

QuestionnaireSubmissionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

// ── RedemptionCatalogueItem ──────────────────────────────────────────────────
const RedemptionCatalogueItemSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, required: true },
  costTokens:  { type: Number, required: true },
  category:    { type: String, required: true },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

RedemptionCatalogueItemSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

module.exports = {
  Measurement:              mongoose.model("Measurement", MeasurementSchema),
  AIRecommendation:         mongoose.model("AIRecommendation", AIRecommendationSchema),
  InterventionPlan:         mongoose.model("InterventionPlan", InterventionPlanSchema),
  ScheduleEntry:            mongoose.model("ScheduleEntry", ScheduleEntrySchema),
  SmartContract:            mongoose.model("SmartContract", SmartContractSchema),
  QuestionnaireSubmission:  mongoose.model("QuestionnaireSubmission", QuestionnaireSubmissionSchema),
  RedemptionCatalogueItem:  mongoose.model("RedemptionCatalogueItem", RedemptionCatalogueItemSchema),
};
