const Consent = require("../models/Consent");
const { writeAudit } = require("./auditService");

const listForClient = (clientId) =>
  Consent.find({ clientId }).sort({ createdAt: -1 });

// Consent is an append-only event log, so only the MOST RECENT event for the
// scope counts — matching any historical granted:true would let a revocation
// be ignored.
const latestForScope = (clientId, scope) =>
  Consent.findOne({ clientId, scope }).sort({ createdAt: -1 }).select("granted").lean();

const record = async (actor, clientId, { scope, granted }) => {
  // The consent record itself must say who recorded it (client, or a
  // clinician/admin acting on their behalf) — not just the separate audit log.
  const event = await Consent.create({
    clientId, scope, granted,
    recordedBy: actor.id, recordedByRole: actor.role,
  });
  await writeAudit(actor, "CONSENT", `Consent ${granted ? "granted" : "revoked"}: ${scope}`, {
    clientId, scope,
  });
  return event;
};

module.exports = { listForClient, latestForScope, record };
