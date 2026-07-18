const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const questionnaireService = require("../services/questionnaireService");

// POST /api/questionnaires
// The frontend contract is a flat map of questionId → scalar answer
// (scale/minutes numbers or yes-no booleans); answers is stored as Mixed, so
// shape and size are enforced by the scalarMap rule before anything reaches
// the database.
const submit = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    clientId: { type: "objectId", required: req.user.role !== "client", label: "clientId" },
    answers:  { type: "scalarMap", required: true, max: 100, maxKey: 64, label: "answers" },
  });
  if (!ok) return validationFailed(res, fields);

  const submission = await questionnaireService.submit(req.user, values);
  res.status(201).json(submission);
});

// GET /api/questionnaires/client/:clientId
const listForClient = asyncHandler(async (req, res) => {
  const subs = await questionnaireService.listForClient(req.params.clientId);
  res.json(subs);
});

module.exports = { submit, listForClient };
