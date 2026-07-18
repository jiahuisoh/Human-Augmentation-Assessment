const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const staffService = require("../services/staffService");

// GET /api/staff/clients/pending-verification
const listPendingVerification = asyncHandler(async (req, res) => {
  const clients = await staffService.listPendingVerification();
  res.json(clients);
});

// POST /api/staff/users/:id/verify-nric
const verifyNric = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    nric: { type: "nric", required: true },
  });
  if (!ok) return validationFailed(res, fields);

  const outcome = await staffService.verifyNric(req.user, req.params.id, values.nric);
  res.json(outcome);
});

module.exports = { listPendingVerification, verifyNric };
