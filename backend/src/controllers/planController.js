const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const planService = require("../services/planService");

// GET /api/plans/client/:clientId
const latestForClient = asyncHandler(async (req, res) => {
  const plan = await planService.latestForClient(req.params.clientId);
  res.json(plan || null);
});

// POST /api/plans
const create = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    clientId: { type: "objectId", required: true, label: "clientId" },
    items:    { type: "array", required: true, max: 100, label: "items" },
  });
  if (!ok) return validationFailed(res, fields);

  const plan = await planService.create(req.user, values);
  res.status(201).json(plan);
});

module.exports = { latestForClient, create };
