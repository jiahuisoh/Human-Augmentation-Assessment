const Session = require("../models/Session");
const httpError = require("../utils/httpError");
const { canAccessClient } = require("../middleware/access");
const consentService = require("./consentService");
const { writeAudit } = require("./auditService");

// CV result lands here after a test completes. `values` holds only the
// whitelisted, normalized fields from the controller's validation schema.
const createSession = async (actor, values) => {
  // Clients may only save their own; clinicians only their assigned clients; admin any.
  // Staff/developers are denied (canAccessClient returns false for them).
  const clientId = actor.role === "client" ? actor.id : values.clientId;
  if (!canAccessClient(actor, clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }

  // PDPA: a client saving their own self-test must have consented. Only the
  // most recent consent event for the scope counts (see consent.service).
  if (actor.role === "client") {
    const consent = await consentService.latestForScope(clientId, "assessment_data");
    if (!consent || !consent.granted) {
      throw httpError(403, "Client has not consented to assessment data collection.");
    }
  }

  const session = await Session.create({
    ...values,
    clientId,
    conductedBy: actor.id,
  });

  const how = actor.role === "client" ? "self-administered by client" : `conducted by ${actor.role}`;
  await writeAudit(
    actor, "ASSESSMENT", `Assessment session ${how}: ${session.testId}`,
    { sessionId: session._id, clientId }, actor.role === "administrator" ? "WARN" : "INFO",
  );
  return session;
};

const listForClient = (clientId) =>
  Session.find({ clientId }).sort({ createdAt: -1 });

// Clinician/admin override with mandatory reason and full audit trail.
const overrideScore = async (actor, sessionId, { reason, newScore }) => {
  const existing = await Session.findById(sessionId)
    .select("clientId testId reps measurement overrides")
    .lean();
  if (!existing) throw httpError(404, "Session not found");
  if (!canAccessClient(actor, existing.clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }

  // Integrity: the "before" value is read from the stored session, never taken
  // from the caller — the current score is the latest override if one exists,
  // otherwise the base result (reps preferred for chair stand, measurement
  // otherwise, falling back to whichever field holds a value). Only a session
  // with no override history AND no recorded score at all is un-overridable.
  const priorOverrides = existing.overrides || [];
  const originalScore = priorOverrides.length
    ? priorOverrides[priorOverrides.length - 1].newScore
    : (existing.testId === "chair_stand"
        ? existing.reps ?? existing.measurement
        : existing.measurement ?? existing.reps);
  if (typeof originalScore !== "number") {
    throw httpError(409, "Session has no recorded score to override.");
  }

  const session = await Session.findByIdAndUpdate(
    sessionId,
    { $push: { overrides: { by: actor.id, byRole: actor.role, reason, originalScore, newScore, at: new Date().toISOString() } } },
    { new: true, runValidators: true },
  );
  await writeAudit(actor, "ASSESSMENT", `Score overridden from ${originalScore} to ${newScore}`, {
    sessionId, reason,
  }, "WARN");
  return session;
};

module.exports = { createSession, listForClient, overrideScore };
