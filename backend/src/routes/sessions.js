const express = require("express");
const router = express.Router();
const Session = require("../models/Session");
const Consent = require("../models/Consent");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { canAccessClient, requireClientAccess, requireVerifiedClient } = require("../middleware/access");
const writeAudit = require("../middleware/auditLogger");
const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");

// POST /api/sessions — CV result lands here after a test completes
router.post("/", verifyJWT, requireVerifiedClient, asyncHandler(async (req, res) => {
  // Clients may only save their own; clinicians only their assigned clients; admin any.
  // Staff/developers are denied (canAccessClient returns false for them).
  const clientId = req.user.role === "client" ? req.user.id : req.body.clientId;
  if (!canAccessClient(req.user, clientId)) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }

  // PDPA: a client saving their own self-test must have consented. Consent is an
  // append-only event log, so only the MOST RECENT event for the scope counts —
  // matching any historical granted:true would let a revocation be ignored.
  if (req.user.role === "client") {
    const consent = await Consent.findOne({ clientId, scope: "assessment_data" })
      .sort({ createdAt: -1 })
      .select("granted")
      .lean();
    if (!consent || !consent.granted) {
      return res.status(403).json({ error: "Client has not consented to assessment data collection." });
    }
  }

  const b = req.body;
  const session = await Session.create({
    clientId,
    conductedBy: req.user.id,
    testId: b.testId,
    reps: b.reps,
    measurement: b.measurement,
    classification: b.classification,
    riskLevel: b.riskLevel,
    interpretation: b.interpretation,
    normLow: b.normLow,
    normHigh: b.normHigh,
    terminatedEarly: b.terminatedEarly,
  });

  const how = req.user.role === "client" ? "self-administered by client" : `conducted by ${req.user.role}`;
  await writeAudit(
    req, "ASSESSMENT", `Assessment session ${how}: ${session.testId}`,
    { sessionId: session._id, clientId }, req.user.role === "administrator" ? "WARN" : "INFO",
  );
  res.status(201).json(session);
}));

// GET /api/sessions/client/:clientId
router.get("/client/:clientId", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const sessions = await Session.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
  res.json(sessions);
}));

// PATCH /api/sessions/:id/override — clinician/admin override with mandatory reason and full audit trail
router.patch("/:id/override", verifyJWT, requireRole("clinician", "administrator"), asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    reason:        { type: "string", required: true, max: 1000, label: "Reason", message: "reason is required for override" },
    originalScore: { type: "number", required: true, min: -100000, max: 100000, label: "originalScore" },
    newScore:      { type: "number", required: true, min: -100000, max: 100000, label: "newScore" },
  });
  if (!ok) return validationFailed(res, fields);
  const { reason, originalScore, newScore } = values;

  // Only clientId is needed to authorize; don't hydrate the whole session document.
  const existing = await Session.findById(req.params.id).select("clientId").lean();
  if (!existing) return res.status(404).json({ error: "Session not found" });
  if (!canAccessClient(req.user, existing.clientId)) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }

  const session = await Session.findByIdAndUpdate(
    req.params.id,
    { $push: { overrides: { by: req.user.id, byRole: req.user.role, reason, originalScore, newScore, at: new Date().toISOString() } } },
    { new: true },
  );
  await writeAudit(req, "ASSESSMENT", `Score overridden from ${originalScore} to ${newScore}`, {
    sessionId: req.params.id, reason,
  }, "WARN");
  res.json(session);
}));

module.exports = router;
