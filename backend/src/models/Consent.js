const mongoose = require("mongoose");

const ConsentSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  scope:    { type: String, enum: ["research","clinician_share","third_party","institutional"], required: true },
  granted:  { type: Boolean, required: true },
  reason:   { type: String },
  txHash:   { type: String },
}, { timestamps: true });

ConsentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("ConsentEvent", ConsentSchema);
