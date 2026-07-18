const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const { CONSENT_SCOPES } = require("../utils/constants");
const consentService = require("../services/consentService");

// GET /api/consent/:clientId
const listForClient = asyncHandler(async (req, res) => {
  const events = await consentService.listForClient(req.params.clientId);
  res.json(events);
});

// POST /api/consent/:clientId
const record = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    scope:   { type: "enum", required: true, values: CONSENT_SCOPES, label: "scope" },
    granted: { type: "boolean", required: true, label: "granted" },
  });
  if (!ok) return validationFailed(res, fields);

  const event = await consentService.record(req.user, req.params.clientId, values);
  res.status(201).json(event);
});

module.exports = { listForClient, record };
