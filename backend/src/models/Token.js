const mongoose = require("mongoose");

const TokenSchema = new mongoose.Schema({
  clientId:        { type: String, required: true, index: true },
  amount:          { type: Number, required: true },
  eventType:       {
    type: String,
    enum: ["assessment_complete","session_attended","adherence_milestone","self_monitoring","clinical_milestone","redemption","manual_adjustment","revocation"],
    required: true,
  },
  issuedBy:        { type: String },
  reason:          { type: String },
  requiresApproval:{ type: Boolean, default: false },
  approvedBy:      { type: String },
  approvedAt:      { type: String },
  rejectedBy:      { type: String },
  rejectedAt:      { type: String },
  rejectionReason: { type: String },
  revokedBy:       { type: String },
  revokedAt:       { type: String },
  revocationReason:{ type: String },
  status:          { type: String, enum: ["pending","approved","rejected","revoked"], default: "approved" },
  livenessScore:   { type: Number },
  sessionId:       { type: String },
  txHash:          { type: String },
}, { timestamps: true });

TokenSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("TokenTransaction", TokenSchema);
