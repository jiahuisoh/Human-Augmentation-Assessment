const mongoose = require("mongoose");
const { TEST_IDS } = require("../utils/constants");

// time field added to match frontend ScheduleEntry type
const ScheduleEntrySchema = new mongoose.Schema({
  clientId:     { type: String, required: true },
  clientName:   { type: String, required: true },
  testId:       { type: String, enum: TEST_IDS, required: true },
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

module.exports = mongoose.model("ScheduleEntry", ScheduleEntrySchema);
