const AIRecommendation = require("../models/AIRecommendation");
const httpError = require("../utils/httpError");
const { canAccessClient } = require("../middleware/access");
const { writeAudit } = require("./auditService");

const listPendingForClinician = (clinicianId) =>
  AIRecommendation.find({ assignedTo: clinicianId, status: "pending" });

const listForClient = (clientId) =>
  AIRecommendation.find({ clientId });

const approve = async (actor, recId) => {
  const rec = await AIRecommendation.findById(recId).select("clientId").lean();
  if (!rec) throw httpError(404, "Recommendation not found");
  if (!canAccessClient(actor, rec.clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }
  const updated = await AIRecommendation.findByIdAndUpdate(recId, {
    status: "approved", reviewedBy: actor.id,
  }, { new: true });
  await writeAudit(actor, "AI", `AI recommendation approved`, { recId: rec._id });
  return updated;
};

const override = async (actor, recId, reason) => {
  const rec = await AIRecommendation.findById(recId).select("clientId").lean();
  if (!rec) throw httpError(404, "Recommendation not found");
  if (!canAccessClient(actor, rec.clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }
  const updated = await AIRecommendation.findByIdAndUpdate(recId, {
    status: "overridden", reviewedBy: actor.id, overrideReason: reason,
  }, { new: true });
  await writeAudit(actor, "AI", `AI recommendation overridden`, { recId: rec._id, reason }, "WARN");
  return updated;
};

module.exports = { listPendingForClinician, listForClient, approve, override };
