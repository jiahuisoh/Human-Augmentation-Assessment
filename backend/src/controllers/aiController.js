const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const aiService = require("../services/aiService");

// GET /api/ai/pending/:clinicianId - a clinician's own pending recommendations
const listPending = asyncHandler(async (req, res) => {
  if (req.user.role === "clinician" && req.user.id !== req.params.clinicianId) {
    return res.status(403).json({ error: "Access denied" });
  }
  const recs = await aiService.listPendingForClinician(req.params.clinicianId);
  res.json(recs);
});

// GET /api/ai/client/:clientId
const listForClient = asyncHandler(async (req, res) => {
  const recs = await aiService.listForClient(req.params.clientId);
  res.json(recs);
});

// POST /api/ai/:id/approve
const approve = asyncHandler(async (req, res) => {
  const updated = await aiService.approve(req.user, req.params.id);
  res.json(updated);
});

// POST /api/ai/:id/override
const override = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    reason: { type: "string", required: true, max: 1000, label: "Reason", message: "reason is required for override" },
  });
  if (!ok) return validationFailed(res, fields);

  const updated = await aiService.override(req.user, req.params.id, values.reason);
  res.json(updated);
});

module.exports = { listPending, listForClient, approve, override };
