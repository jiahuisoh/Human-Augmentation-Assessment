const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const { TEST_IDS, RISK_LEVELS } = require("../utils/constants");
const sessionService = require("../services/sessionService");

// POST /api/sessions/cv-grant
const createCvGrant = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    testId:   { type: "enum", required: true, values: TEST_IDS, label: "testId" },
    clientId: { type: "objectId", label: "clientId" },
    sandbox:  { type: "boolean", label: "sandbox" },
  });
  if (!ok) return validationFailed(res, fields);

  if (!values.sandbox && req.user.role !== "client" && !values.clientId) {
    return res.status(400).json({ error: "clientId is required" });
  }

  const grant = await sessionService.issueCvGrant(req.user, values);
  res.status(201).json(grant);
});

// POST /api/sessions - signed CV outcome token lands here
const createSession = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    cvOutcomeToken: { type: "string", required: true, label: "cvOutcomeToken" },
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

// GET /api/sessions/:id
const getById = asyncHandler(async (req, res) => {
  const session = await sessionService.getById(req.user, req.params.id);
  res.json(session);
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

// DELETE /api/sessions/:id
const deleteSession = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    reason: { type: "string", required: true, max: 1000, label: "reason", message: "reason is required for deletion" },
  });
  if (!ok) return validationFailed(res, fields);

  const result = await sessionService.deleteSession(req.user, req.params.id, values);
  res.json(result);
});

module.exports = { createCvGrant, createSession, listForClient, getById, overrideScore, deleteSession };