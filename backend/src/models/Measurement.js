const mongoose = require("mongoose");

const MeasurementSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  height:   { type: Number, required: true },
  weight:   { type: Number, required: true },
  bmi:      { type: Number, required: true },
}, { timestamps: true });

// find({clientId}).sort({createdAt:-1}) - supersedes a standalone clientId index.
MeasurementSchema.index({ clientId: 1, createdAt: -1 });

MeasurementSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("Measurement", MeasurementSchema);
