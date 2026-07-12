const express = require("express");
const router = express.Router();
const Consent = require("../models/Consent");
const AuditLog = require("../models/Audit");
const { AIRecommendation, InterventionPlan, ScheduleEntry, QuestionnaireSubmission } = require("../models/Misc");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { canAccessClient, requireClientAccess } = require("../middleware/access");
const writeAudit = require("../middleware/auditLogger");

// ══════════════════════════════════════════════════════════════════════════════
// CONSENT
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/consent/:clientId
router.get("/consent/:clientId", verifyJWT, requireClientAccess("clientId"), async (req, res) => {
  try {
    const events = await Consent.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/consent/:clientId
router.post("/consent/:clientId", verifyJWT, requireClientAccess("clientId"), async (req, res) => {
  try {
    const { scope, granted } = req.body;
    const event = await Consent.create({ clientId: req.params.clientId, scope, granted });
    await writeAudit(req, "CONSENT", `Consent ${granted ? "granted" : "revoked"}: ${scope}`, {
      clientId: req.params.clientId, scope,
    });
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/audit
router.get("/audit", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AI RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/ai/pending/:clinicianId — a clinician's own pending recommendations
router.get("/ai/pending/:clinicianId", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    if (req.user.role === "clinician" && req.user.id !== req.params.clinicianId) {
      return res.status(403).json({ error: "Access denied" });
    }
    const recs = await AIRecommendation.find({ assignedTo: req.params.clinicianId, status: "pending" });
    res.json(recs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/client/:clientId
router.get("/ai/client/:clientId", verifyJWT, requireRole("clinician", "administrator"), requireClientAccess("clientId"), async (req, res) => {
  try {
    const recs = await AIRecommendation.find({ clientId: req.params.clientId });
    res.json(recs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/:id/approve
router.post("/ai/:id/approve", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const rec = await AIRecommendation.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: "Recommendation not found" });
    if (!canAccessClient(req.user, rec.clientId)) {
      return res.status(403).json({ error: "You do not have access to this client's data." });
    }
    const updated = await AIRecommendation.findByIdAndUpdate(req.params.id, {
      status: "approved", reviewedBy: req.user.id,
    }, { new: true });
    await writeAudit(req, "AI", `AI recommendation approved`, { recId: rec._id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/:id/override
router.post("/ai/:id/override", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "reason required for override" });
    const rec = await AIRecommendation.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: "Recommendation not found" });
    if (!canAccessClient(req.user, rec.clientId)) {
      return res.status(403).json({ error: "You do not have access to this client's data." });
    }
    const updated = await AIRecommendation.findByIdAndUpdate(req.params.id, {
      status: "overridden", reviewedBy: req.user.id, overrideReason: reason,
    }, { new: true });
    await writeAudit(req, "AI", `AI recommendation overridden`, { recId: rec._id, reason }, "WARN");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERVENTION PLANS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/plans/client/:clientId
router.get("/plans/client/:clientId", verifyJWT, requireClientAccess("clientId"), async (req, res) => {
  try {
    const plan = await InterventionPlan.findOne({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(plan || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plans
router.post("/plans", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { clientId, items } = req.body;
    if (!canAccessClient(req.user, clientId)) {
      return res.status(403).json({ error: "You do not have access to this client's data." });
    }
    const plan = await InterventionPlan.create({ clientId, authoredBy: req.user.id, items });
    await writeAudit(req, "ASSESSMENT", `Intervention plan created for ${plan.clientId}`, { planId: plan._id });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/schedule/today
router.get("/schedule/today", verifyJWT, requireRole("staff", "administrator"), async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const entries = await ScheduleEntry.find({ date: today });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/schedule/:id/attendance
router.patch("/schedule/:id/attendance", verifyJWT, requireRole("staff", "administrator"), async (req, res) => {
  try {
    const { present } = req.body;
    const entry = await ScheduleEntry.findByIdAndUpdate(req.params.id, {
      status: present ? "present" : "absent",
    }, { new: true });
    if (!entry) return res.status(404).json({ error: "Schedule entry not found" });
    await writeAudit(req, "ASSESSMENT", `Attendance recorded: ${present ? "present" : "absent"}`, { entryId: entry._id });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/questionnaires
router.post("/questionnaires", verifyJWT, async (req, res) => {
  try {
    const clientId = req.user.role === "client" ? req.user.id : req.body.clientId;
    if (!canAccessClient(req.user, clientId)) {
      return res.status(403).json({ error: "You do not have access to this client's data." });
    }
    const sub = await QuestionnaireSubmission.create({ clientId, answers: req.body.answers });
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questionnaires/client/:clientId
router.get("/questionnaires/client/:clientId", verifyJWT, requireClientAccess("clientId"), async (req, res) => {
  try {
    const subs = await QuestionnaireSubmission.find({ clientId: req.params.clientId }).sort({ submittedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
