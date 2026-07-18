const mongoose = require("mongoose");

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

module.exports = mongoose.model("AIRecommendation", AIRecommendationSchema);
