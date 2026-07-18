const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const scheduleService = require("../services/scheduleService");

// GET /api/schedule/today
const listToday = asyncHandler(async (req, res) => {
  const entries = await scheduleService.listToday();
  res.json(entries);
});

// PATCH /api/schedule/:id/attendance
const setAttendance = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    present: { type: "boolean", required: true, label: "present" },
  });
  if (!ok) return validationFailed(res, fields);

  const entry = await scheduleService.setAttendance(req.user, req.params.id, values.present);
  res.json(entry);
});

module.exports = { listToday, setAttendance };
