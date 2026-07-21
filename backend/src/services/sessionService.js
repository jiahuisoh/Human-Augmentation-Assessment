const crypto = require("crypto");
const Session = require("../models/Session");
const User = require("../models/User");
const httpError = require("../utils/httpError");
const { canAccessClient } = require("../middleware/access");
const { ageFrom, normaliseSex, deriveOutcome } = require("../utils/norms");
const { heightLimits } = require("../utils/constants");
const cvToken = require("../utils/cvToken");
const consentService = require("./consentService");
const { writeAudit } = require("./auditService");

const inRange = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

// Signed values are still shape- and range-checked: a signature proves origin,
// not sanity. A blown calibration can produce a physically impossible reading,
// and without this it would reach Mongoose and fail as a bare "Invalid input"
// with the assessment lost and nothing explaining why.
const numberOrUndefined = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const SIGNED_RANGES = {
  reps:               [0, 50],
  measurement:        [-100, 100],
  timeTo5StandsS:     [0, 120],
  kneeOffsetCm:       [-200, 200],
  calibrationQuality: [0, 1],
};

const assertSignedRanges = (values) => {
  for (const [field, [min, max]] of Object.entries(SIGNED_RANGES)) {
    const value = values[field];
    if (value !== undefined && (value < min || value > max)) {
      throw httpError(422, `The assessment produced an out-of-range ${field} (${value}); the result was not saved. Check the client's height and re-run the test.`);
    }
  }
};

// Long enough to walk a client through the instructions and run a 30 s test,
// short enough that a leaked grant is worthless by the time it is found.
const GRANT_TTL_SECONDS = 600;

// The developer CV sandbox has no client. It gets a grant carrying synthetic
// demographics and sandbox: true, which createSession refuses to persist - so
// the sandbox banner is now a real property rather than a claim.
const SANDBOX_SUBJECT = { age: 70, sex: "other", height: 170 };

/**
 * Mint a short-lived grant authorising ONE assessment run on the CV service.
 * The client's real age/sex/height travel inside the signed token, so the CV
 * service never has to trust the browser for the values that choose a norm
 * band or set the centimetre scale.
 */
const issueCvGrant = async (actor, { clientId, testId, sandbox }) => {
  if (sandbox) {
    if (!["developer", "administrator"].includes(actor.role)) {
      throw httpError(403, "Only developers and administrators may use the CV sandbox.");
    }
    const token = cvToken.sign("cv_grant", {
      jti: crypto.randomUUID(),
      cid: null,
      tid: testId,
      sandbox: true,
      by: actor.id,
      ...SANDBOX_SUBJECT,
    }, GRANT_TTL_SECONDS);
    await writeAudit(actor, "CV", `CV sandbox grant issued: ${testId}`, { testId });
    return { token, expiresInSeconds: GRANT_TTL_SECONDS };
  }

  const targetId = actor.role === "client" ? actor.id : clientId;
  if (!canAccessClient(actor, targetId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }

  const client = await User.findById(targetId).select("dateOfBirth gender height role").lean();
  if (!client) throw httpError(404, "Client not found");
  if (client.role !== "client") throw httpError(400, "Assessments can only be run for client accounts.");

  const token = cvToken.sign("cv_grant", {
    jti: crypto.randomUUID(),
    cid: targetId,
    tid: testId,
    sandbox: false,
    by: actor.id,
    age: ageFrom(client.dateOfBirth),
    sex: normaliseSex(client.gender),
    height: inRange(client.height, heightLimits.min, heightLimits.max) ? client.height : null,
  }, GRANT_TTL_SECONDS);

  await writeAudit(actor, "CV", `CV grant issued: ${testId}`, { clientId: targetId, testId });
  return { token, expiresInSeconds: GRANT_TTL_SECONDS };
};

// CV result lands here after a test completes. The ONLY input is the outcome
// token the CV service signed: the client id, the test and every raw
// measurement are read out of it, so the browser is a courier rather than a
// source. Anything else in the request body is ignored.
const createSession = async (actor, { cvOutcomeToken }) => {
  const outcome = cvToken.verify(cvOutcomeToken, "cv_outcome");
  if (!outcome) {
    throw httpError(400, "This result could not be verified as coming from the assessment service. Please run the test again.");
  }
  if (outcome.sandbox) {
    throw httpError(400, "Sandbox results are synthetic and cannot be saved to a client record.");
  }
  if (outcome.early) {
    throw httpError(400, "A test that was stopped early is not a valid assessment and cannot be saved.");
  }

  const clientId = outcome.cid;
  // The token binds the result to one client; the actor must still be allowed
  // to write to that client today, in case their assignment changed.
  if (typeof clientId !== "string" || !canAccessClient(actor, clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }

  // Shape-check the signed payload before any database work: authorization is
  // settled above, so anything malformed can be rejected without a round trip.
  const measurements = {
    testId: outcome.tid,
    reps: numberOrUndefined(outcome.reps),
    measurement: numberOrUndefined(outcome.measurement),
    timeTo5StandsS: numberOrUndefined(outcome.t5),
  };
  // Geometry and tracking quality: inputs to the derived verdict, not stored
  // measurements in their own right.
  const quality = {
    kneeOffsetCm: numberOrUndefined(outcome.knee),
    calibrationQuality: numberOrUndefined(outcome.calq),
    kneeBent: typeof outcome.knee_bent === "boolean" ? outcome.knee_bent : undefined,
  };
  // A signed outcome with no score at all (camera never got a usable read)
  // is not an assessment. Storing it would put an empty row in the client's
  // history that, by policy, can never be overridden into a real one.
  if (measurements.reps === undefined && measurements.measurement === undefined) {
    throw httpError(400, "The assessment did not produce a measurable result, so nothing was saved. Please run the test again.");
  }
  assertSignedRanges({ ...measurements, ...quality });

  // PDPA: a client saving their own self-test must have consented. Only the
  // most recent consent event for the scope counts (see consent.service).
  if (actor.role === "client") {
    const consent = await consentService.latestForScope(clientId, "assessment_data");
    if (!consent || !consent.granted) {
      throw httpError(403, "Client has not consented to assessment data collection.");
    }
  }

  // The clinical verdict is computed here, from the profile on file - never
  // taken from the request, and never from the token either. The CV service
  // reports what it measured; what that MEANS is decided by this server.
  const client = await User.findById(clientId).select("dateOfBirth gender height").lean();
  if (!client) throw httpError(404, "Client not found");

  const age = ageFrom(client.dateOfBirth);
  const sex = normaliseSex(client.gender);
  const derived = deriveOutcome({ ...measurements, ...quality, age, sex });

  const session = await Session.create({
    ...measurements,
    ...derived,
    clientId,
    conductedBy: actor.id,
    // Replaying the same signed outcome collides on this unique index, so a
    // captured result cannot be banked twice.
    cvNonce: outcome.jti,
    ageAtTest: age ?? undefined,
    sexAtTest: sex,
    // Snapshot only when it is in range. User.height has no schema bound, so a
    // legacy or seeded profile could otherwise fail Session validation and
    // block the save entirely - the assessment matters more than the snapshot.
    heightAtTestCm: inRange(client.height, heightLimits.min, heightLimits.max) ? client.height : undefined,
  }).catch((err) => {
    if (err && err.code === 11000) {
      throw httpError(409, "This result has already been saved.");
    }
    throw err;
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
  // from the caller - the current score is the latest override if one exists,
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

// Hard delete, for records a clinician judges invalid (wrong client, botched
// setup, duplicate). The document leaves MongoDB, so the audit entry has to
// carry a snapshot of what was removed - otherwise the trail records that
// something was deleted but not what.
const deleteSession = async (actor, sessionId, { reason }) => {
  const existing = await Session.findById(sessionId).lean();
  if (!existing) throw httpError(404, "Session not found");
  if (!canAccessClient(actor, existing.clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }

  await Session.deleteOne({ _id: existing._id });

  await writeAudit(
    actor, "ASSESSMENT", `Assessment session deleted: ${existing.testId}`,
    {
      sessionId, reason,
      deletedRecord: {
        clientId:       existing.clientId,
        conductedBy:    existing.conductedBy,
        testId:         existing.testId,
        reps:           existing.reps ?? null,
        measurement:    existing.measurement ?? null,
        classification: existing.classification ?? null,
        riskLevel:      existing.riskLevel ?? null,
        recordHash:     existing.recordHash ?? null,
        overrideCount:  (existing.overrides || []).length,
        createdAt:      existing.createdAt ? existing.createdAt.toISOString() : null,
      },
    },
    "WARN",
  );
  return { deleted: true, _id: sessionId };
};

module.exports = { issueCvGrant, createSession, listForClient, overrideScore, deleteSession };
