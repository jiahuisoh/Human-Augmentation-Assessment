const QuestionnaireSubmission = require("../models/QuestionnaireSubmission");
const httpError = require("../utils/httpError");
const { canAccessClient } = require("../middleware/access");

// Same pattern as session.service: clients submit for themselves;
// clinicians/admins must name a valid clientId they can access.
const submit = async (actor, values) => {
  const clientId = actor.role === "client" ? actor.id : values.clientId;
  if (!canAccessClient(actor, clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }
  return QuestionnaireSubmission.create({ clientId, answers: values.answers });
};

const listForClient = (clientId) =>
  QuestionnaireSubmission.find({ clientId }).sort({ submittedAt: -1 });

module.exports = { submit, listForClient };
