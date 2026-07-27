const mongoose = require("mongoose");
const { TEST_IDS } = require("../utils/constants");

// clientName is denormalized on purpose: it is who the front desk was expecting
// on the day, and it has to survive the account being renamed or deleted.
// Verification status deliberately is NOT stored - scheduleService joins it
// live, because an administrator can verify or suspend an account at any point
// after the booking was made and a stored copy would go stale in silence.
const ScheduleEntrySchema = new mongoose.Schema({
  clientId:   { type: String, required: true },
  clientName: { type: String, required: true },
  testId:     { type: String, enum: TEST_IDS, required: true },
  date:       { type: String, required: true }, // clinic-local YYYY-MM-DD
  time:       { type: String, required: true }, // 24-hour HH:MM
  status:     { type: String, enum: ["scheduled", "present", "absent", "in_progress", "completed"], default: "scheduled" },
}, { timestamps: true });

// The front desk loads find({date: today}) on every visit.
ScheduleEntrySchema.index({ date: 1 });

// Two rules, both enforced by the database and not only by the service: two
// clinicians booking at the same moment would each pass a read-then-write check.
//
// 1. The same assessment is not repeated for a client on the same day. The
//    clientId prefix also serves the per-client upcoming lookup.
ScheduleEntrySchema.index({ clientId: 1, testId: 1, date: 1 }, { unique: true });
// 2. A client is in one place at a time. The battery is normally run across one
//    visit - chair stand, then sit & reach, then back scratch - so several
//    assessments in a day are expected; several at the same minute are not.
ScheduleEntrySchema.index({ clientId: 1, date: 1, time: 1 }, { unique: true });

ScheduleEntrySchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  return obj;
};

module.exports = mongoose.model("ScheduleEntry", ScheduleEntrySchema);
