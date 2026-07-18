const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const { TEST_IDS, RISK_LEVELS } = require("../utils/constants");
const sessionService = require("../services/sessionService");

// POST /api/sessions — CV result lands here after a test completes
const createSession = asyncHandler(async (req, res) => {
  // Whitelist + bound every field before it can reach Session.create: enums for
  // testId/riskLevel, ranges on the numbers (measurements in cm), length
  // caps on the free-text CV outputs.
  const { ok, fields, values } = validate(req.body, {
    clientId:        { type: "objectId", required: req.user.role !== "client", label: "clientId" },
    testId:          { type: "enum", required: true, values: TEST_IDS, label: "testId" },
    reps:            { type: "number", min: 0, max: 50, label: "reps" },
    measurement:     { type: "number", min: -100, max: 100, label: "measurement" },
    classification:  { type: "string", max: 200, label: "classification" },
    riskLevel:       { type: "enum", values: RISK_LEVELS, label: "riskLevel" },
    interpretation:  { type: "string", max: 1500, label: "interpretation" },
    normLow:         { type: "number", min: -100, max: 100, label: "normLow" },
    normHigh:        { type: "number", min: -100, max: 100, label: "normHigh" },
    terminatedEarly: { type: "boolean", label: "terminatedEarly" },
  });
  if (!ok) return validationFailed(res, fields);

  const session = await sessionService.createSession(req.user, values);
  res.status(201).json(session);
});

// GET /api/sessions/client/:clientId
const listForClient = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listForClient(req.params.clientId);
  res.json(sessions);
});

// PATCH /api/sessions/:id/override
const overrideScore = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    reason:   { type: "string", required: true, max: 1000, label: "Reason", message: "reason is required for override" },
    newScore: { type: "number", required: true, min: -100, max: 100, label: "newScore" },
  });
  if (!ok) return validationFailed(res, fields);

  const session = await sessionService.overrideScore(req.user, req.params.id, values);
  res.json(session);
});

module.exports = { createSession, listForClient, overrideScore };
