const ScheduleEntry = require("../models/ScheduleEntry");
const httpError = require("../utils/httpError");
const { writeAudit } = require("./auditService");

const listToday = () => {
  const today = new Date().toISOString().split("T")[0];
  return ScheduleEntry.find({ date: today });
};

const setAttendance = async (actor, entryId, present) => {
  const entry = await ScheduleEntry.findByIdAndUpdate(entryId, {
    status: present ? "present" : "absent",
  }, { new: true });
  if (!entry) throw httpError(404, "Schedule entry not found");
  await writeAudit(actor, "ASSESSMENT", `Attendance recorded: ${present ? "present" : "absent"}`, { entryId: entry._id });
  return entry;
};

module.exports = { listToday, setAttendance };
