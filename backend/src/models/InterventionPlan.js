const mongoose = require("mongoose");

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

module.exports = mongoose.model("InterventionPlan", InterventionPlanSchema);
