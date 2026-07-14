const mongoose = require("mongoose");

// ConsentScope matches frontend types/index.ts exactly:
// "research" | "clinician_share" | "third_party" | "institutional"
// We also add "assessment_data" for PDPA internal use
const ConsentSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  scope:    {
    type: String,
    enum: ["research","clinician_share","third_party","institutional","assessment_data"],
    required: true,
  },
  granted:  { type: Boolean, required: true },
  reason:   { type: String },
  txHash:   { type: String },
}, { timestamps: true });

// Serves the PDPA gate on every assessment save: the latest event for a
// (client, scope) pair, i.e. findOne({clientId, scope}).sort({createdAt:-1}).
// The clientId prefix also covers the per-client consent history list, so a
// standalone clientId index would be redundant.
ConsentSchema.index({ clientId: 1, scope: 1, createdAt: -1 });

ConsentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("ConsentEvent", ConsentSchema);
