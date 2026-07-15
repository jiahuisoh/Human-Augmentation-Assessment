const express = require("express");
const router = express.Router();
const Consent = require("../models/Consent");
const AuditLog = require("../models/Audit");
const { AIRecommendation, InterventionPlan, ScheduleEntry, QuestionnaireSubmission } = require("../models/Misc");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { canAccessClient, requireClientAccess, requireVerifiedClient } = require("../middleware/access");
const writeAudit = require("../middleware/auditLogger");
const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");

const CONSENT_SCOPES = ["research", "clinician_share", "third_party", "institutional", "assessment_data"];

// ══════════════════════════════════════════════════════════════════════════════
// CONSENT
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/consent/:clientId
router.get("/consent/:clientId", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const events = await Consent.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
  res.json(events);
}));

// POST /api/consent/:clientId
router.post("/consent/:clientId", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    scope:   { type: "enum", required: true, values: CONSENT_SCOPES, label: "scope" },
    granted: { type: "boolean", required: true, label: "granted" },
  });
  if (!ok) return validationFailed(res, fields);
  const { scope, granted } = values;
  const event = await Consent.create({ clientId: req.params.clientId, scope, granted });
  await writeAudit(req, "CONSENT", `Consent ${granted ? "granted" : "revoked"}: ${scope}`, {
    clientId: req.params.clientId, scope,
  });
  res.status(201).json(event);
}));

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/audit
router.get("/audit", verifyJWT, requireRole("administrator"), asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit);
  res.json(logs);
}));

// ══════════════════════════════════════════════════════════════════════════════
// AI RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/ai/pending/:clinicianId — a clinician's own pending recommendations
router.get("/ai/pending/:clinicianId", verifyJWT, requireRole("clinician", "administrator"), asyncHandler(async (req, res) => {
  if (req.user.role === "clinician" && req.user.id !== req.params.clinicianId) {
    return res.status(403).json({ error: "Access denied" });
  }
  const recs = await AIRecommendation.find({ assignedTo: req.params.clinicianId, status: "pending" });
  res.json(recs);
}));

// GET /api/ai/client/:clientId
router.get("/ai/client/:clientId", verifyJWT, requireRole("clinician", "administrator"), requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const recs = await AIRecommendation.find({ clientId: req.params.clientId });
  res.json(recs);
}));

// POST /api/ai/:id/approve
router.post("/ai/:id/approve", verifyJWT, requireRole("clinician", "administrator"), asyncHandler(async (req, res) => {
  // Only clientId is needed to authorize; don't hydrate the whole document.
  const rec = await AIRecommendation.findById(req.params.id).select("clientId").lean();
  if (!rec) return res.status(404).json({ error: "Recommendation not found" });
  if (!canAccessClient(req.user, rec.clientId)) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }
  const updated = await AIRecommendation.findByIdAndUpdate(req.params.id, {
    status: "approved", reviewedBy: req.user.id,
  }, { new: true });
  await writeAudit(req, "AI", `AI recommendation approved`, { recId: rec._id });
  res.json(updated);
}));

// POST /api/ai/:id/override
router.post("/ai/:id/override", verifyJWT, requireRole("clinician", "administrator"), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "reason required for override" });
  const rec = await AIRecommendation.findById(req.params.id).select("clientId").lean();
  if (!rec) return res.status(404).json({ error: "Recommendation not found" });
  if (!canAccessClient(req.user, rec.clientId)) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }
  const updated = await AIRecommendation.findByIdAndUpdate(req.params.id, {
    status: "overridden", reviewedBy: req.user.id, overrideReason: reason,
  }, { new: true });
  await writeAudit(req, "AI", `AI recommendation overridden`, { recId: rec._id, reason }, "WARN");
  res.json(updated);
}));

// ══════════════════════════════════════════════════════════════════════════════
// INTERVENTION PLANS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/plans/client/:clientId
router.get("/plans/client/:clientId", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const plan = await InterventionPlan.findOne({ clientId: req.params.clientId }).sort({ createdAt: -1 });
  res.json(plan || null);
}));

// POST /api/plans
router.post("/plans", verifyJWT, requireRole("clinician", "administrator"), asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    clientId: { type: "objectId", required: true, label: "clientId" },
    items:    { type: "array", required: true, max: 100, label: "items" },
  });
  if (!ok) return validationFailed(res, fields);
  const { clientId, items } = values;
  if (!canAccessClient(req.user, clientId)) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }
  const plan = await InterventionPlan.create({ clientId, authoredBy: req.user.id, items });
  await writeAudit(req, "ASSESSMENT", `Intervention plan created for ${plan.clientId}`, { planId: plan._id });
  res.status(201).json(plan);
}));

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/schedule/today
router.get("/schedule/today", verifyJWT, requireRole("staff", "administrator"), asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const entries = await ScheduleEntry.find({ date: today });
  res.json(entries);
}));

// PATCH /api/schedule/:id/attendance
router.patch("/schedule/:id/attendance", verifyJWT, requireRole("staff", "administrator"), asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    present: { type: "boolean", required: true, label: "present" },
  });
  if (!ok) return validationFailed(res, fields);
  const { present } = values;
  const entry = await ScheduleEntry.findByIdAndUpdate(req.params.id, {
    status: present ? "present" : "absent",
  }, { new: true });
  if (!entry) return res.status(404).json({ error: "Schedule entry not found" });
  await writeAudit(req, "ASSESSMENT", `Attendance recorded: ${present ? "present" : "absent"}`, { entryId: entry._id });
  res.json(entry);
}));

// ══════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/questionnaires
router.post("/questionnaires", verifyJWT, requireVerifiedClient, asyncHandler(async (req, res) => {
  const clientId = req.user.role === "client" ? req.user.id : req.body.clientId;
  if (!canAccessClient(req.user, clientId)) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }
  const { answers } = req.body;
  if (typeof answers !== "object" || answers === null) {
    return res.status(400).json({ error: "answers is required" });
  }
  const sub = await QuestionnaireSubmission.create({ clientId, answers });
  res.status(201).json(sub);
}));

// GET /api/questionnaires/client/:clientId
router.get("/questionnaires/client/:clientId", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const subs = await QuestionnaireSubmission.find({ clientId: req.params.clientId }).sort({ submittedAt: -1 });
  res.json(subs);
}));

module.exports = router;
