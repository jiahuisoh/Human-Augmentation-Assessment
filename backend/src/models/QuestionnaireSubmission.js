const mongoose = require("mongoose");

const QuestionnaireSubmissionSchema = new mongoose.Schema({
  clientId:    { type: String, required: true },
  answers:     { type: mongoose.Schema.Types.Mixed, required: true },
  submittedAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

// find({clientId}).sort({submittedAt:-1}) - supersedes a standalone clientId index.
QuestionnaireSubmissionSchema.index({ clientId: 1, submittedAt: -1 });

QuestionnaireSubmissionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

module.exports = mongoose.model("QuestionnaireSubmission", QuestionnaireSubmissionSchema);
