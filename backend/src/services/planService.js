const InterventionPlan = require("../models/InterventionPlan");
const httpError = require("../utils/httpError");
const { canAccessClient } = require("../middleware/access");
const { writeAudit } = require("./auditService");

const latestForClient = (clientId) =>
  InterventionPlan.findOne({ clientId }).sort({ createdAt: -1 });

const create = async (actor, { clientId, items }) => {
  if (!canAccessClient(actor, clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }
  const plan = await InterventionPlan.create({ clientId, authoredBy: actor.id, items });
  await writeAudit(actor, "ASSESSMENT", `Intervention plan created for ${plan.clientId}`, { planId: plan._id });
  return plan;
};

module.exports = { latestForClient, create };
