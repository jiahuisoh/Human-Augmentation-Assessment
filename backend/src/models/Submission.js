const mongoose = require("mongoose");

const SubmissionSchema = new mongoose.Schema({
  clientId:           { type: String, required: true, index: true },
  testId:             { type: String, enum: ["chair_stand","back_scratch","sit_reach"], required: true },
  fileName:           { type: String, required: true },
  fileSize:           { type: Number, required: true },
  fileMimeType:       { type: String, required: true },
  storageRef:         { type: String },
  status:             { type: String, enum: ["pending","in_review","approved","rejected"], default: "pending" },
  submittedAt:        { type: String, default: () => new Date().toISOString() },
  reviewedBy:         { type: String },
  reviewedAt:         { type: String },
  reviewerNotes:      { type: String },
  resultingSessionId: { type: String },
}, { timestamps: true });

SubmissionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

module.exports = mongoose.model("VideoSubmission", SubmissionSchema);
