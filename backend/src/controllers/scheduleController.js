const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const { TEST_IDS } = require("../utils/constants");
const scheduleService = require("../services/scheduleService");

// POST /api/schedule - a clinician books an assessment for an assigned patient.
// clientName is never taken from the body; the service reads it from the
// account, so a caller cannot label a booking with someone else's name.
const create = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    clientId: { type: "objectId", required: true, label: "Client" },
    testId:   { type: "enum", required: true, values: TEST_IDS, label: "Assessment" },
    date:     { type: "isoDate", required: true, label: "Date" },
    time:     { type: "timeOfDay", required: true, label: "Time" },
  });
  if (!ok) return validationFailed(res, fields);

  const entry = await scheduleService.create(req.user, values);
  res.status(201).json(entry);
});

// GET /api/schedule/today
const listToday = asyncHandler(async (req, res) => {
  res.json(await scheduleService.listToday());
});

// GET /api/schedule/client/:clientId
const listForClient = asyncHandler(async (req, res) => {
  res.json(await scheduleService.listUpcomingForClient(req.params.clientId));
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

// DELETE /api/schedule/:id
const cancel = asyncHandler(async (req, res) => {
  await scheduleService.cancel(req.user, req.params.id);
  res.status(204).end();
});

module.exports = { create, listToday, listForClient, setAttendance, cancel };
