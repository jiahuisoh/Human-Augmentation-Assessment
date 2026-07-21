const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const { TEST_IDS } = require("../utils/constants");
const sessionService = require("../services/sessionService");

// POST /api/sessions/cv-grant - authorise one CV run and hand the service the
// client's real demographics inside a signed, short-lived token.
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

// POST /api/sessions - the signed CV outcome lands here after a test completes.
const createSession = asyncHandler(async (req, res) => {
  // The token is the whole input. Every measurement, the test id and the client
  // id are read from inside it after the signature is checked, so nothing a
  // caller writes in the body can influence the stored record - not the score,
  // and not the clinical verdict (which sessionService derives independently).
  const { ok, fields, values } = validate(req.body, {
    cvOutcomeToken: {
      type: "string", required: true, max: 4096, label: "cvOutcomeToken",
      message: "A signed result from the assessment service is required.",
    },
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

// DELETE /api/sessions/:id - permanent removal, reason required for the audit trail
const deleteSession = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    reason: { type: "string", required: true, max: 1000, label: "Reason", message: "reason is required to delete an assessment" },
  });
  if (!ok) return validationFailed(res, fields);

  const result = await sessionService.deleteSession(req.user, req.params.id, values);
  res.json(result);
});

module.exports = { createCvGrant, createSession, listForClient, overrideScore, deleteSession };
