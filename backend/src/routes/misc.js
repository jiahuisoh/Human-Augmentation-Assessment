const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");
const Consent = require("../models/Consent");
const AuditLog = require("../models/Audit");
const Session = require("../models/Session");
const { AIRecommendation, InterventionPlan, ScheduleEntry, QuestionnaireSubmission } = require("../models/Misc");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO SUBMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/submissions/video
router.post("/submissions/video", verifyJWT, async (req, res) => {
  try {
    const sub = await Submission.create({
      ...req.body,
      status: "pending",
      submittedAt: new Date().toISOString(),
    });
    await writeAudit(req, "CV", `Video submitted for ${sub.testId}`, {
      submissionId: sub._id, clientId: sub.clientId,
    });
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/client/:clientId
router.get("/submissions/client/:clientId", verifyJWT, async (req, res) => {
  try {
    const subs = await Submission.find({ clientId: req.params.clientId }).sort({ submittedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/pending
router.get("/submissions/pending", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const subs = await Submission.find({ status: "pending" }).sort({ submittedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/submissions/:id
router.delete("/submissions/:id", verifyJWT, async (req, res) => {
  try {
    const sub = await Submission.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    if (req.user.role !== "administrator" && sub.clientId !== req.body.clientId) {
      return res.status(403).json({ error: "Access denied" });
    }
    await sub.deleteOne();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/:id/approve
router.post("/submissions/:id/approve", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { reviewerId, reviewerRole, reps, measurement, classification, notes } = req.body;

    const sub = await Submission.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    const session = await Session.create({
      clientId: sub.clientId,
      conductedBy: reviewerId,
      testId: sub.testId,
      reps, measurement, classification,
    });

    const updatedSub = await Submission.findByIdAndUpdate(req.params.id, {
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewerNotes: notes,
      resultingSessionId: session._id.toString(),
    }, { new: true });

    await writeAudit(req, "CV", `Submission approved, session created`, {
      submissionId: req.params.id, sessionId: session._id,
    });

    res.json({ submission: updatedSub, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/:id/reject
router.post("/submissions/:id/reject", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { reviewerId, notes } = req.body;
    const sub = await Submission.findByIdAndUpdate(req.params.id, {
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewerNotes: notes,
    }, { new: true });
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    await writeAudit(req, "CV", `Submission rejected`, { submissionId: req.params.id, notes }, "WARN");
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CONSENT
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/consent/:clientId
router.get("/consent/:clientId", verifyJWT, async (req, res) => {
  try {
    const events = await Consent.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/consent/:clientId
router.post("/consent/:clientId", verifyJWT, async (req, res) => {
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

// POST /api/audit
router.post("/audit", verifyJWT, async (req, res) => {
  try {
    const log = await AuditLog.create(req.body);
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AI RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/ai/pending/:clinicianId — clinician sees their pending AI recs
router.get("/ai/pending/:clinicianId", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const recs = await AIRecommendation.find({
      assignedTo: req.params.clinicianId,
      status: "pending",
    });
    res.json(recs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/client/:clientId — get all AI recs for a specific client
router.get("/ai/client/:clientId", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
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
    const rec = await AIRecommendation.findByIdAndUpdate(req.params.id, {
      status: "approved", reviewedBy: req.body.byUserId,
    }, { new: true });
    if (!rec) return res.status(404).json({ error: "Recommendation not found" });
    await writeAudit(req, "AI", `AI recommendation approved`, { recId: rec._id });
    res.json(rec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/:id/override
router.post("/ai/:id/override", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { byUserId, reason } = req.body;
    if (!reason) return res.status(400).json({ error: "reason required for override" });
    const rec = await AIRecommendation.findByIdAndUpdate(req.params.id, {
      status: "overridden", reviewedBy: byUserId, overrideReason: reason,
    }, { new: true });
    if (!rec) return res.status(404).json({ error: "Recommendation not found" });
    await writeAudit(req, "AI", `AI recommendation overridden`, { recId: rec._id, reason }, "WARN");
    res.json(rec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERVENTION PLANS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/plans/client/:clientId
router.get("/plans/client/:clientId", verifyJWT, async (req, res) => {
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
    const plan = await InterventionPlan.create(req.body);
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
    const sub = await QuestionnaireSubmission.create(req.body);
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questionnaires/client/:clientId
router.get("/questionnaires/client/:clientId", verifyJWT, async (req, res) => {
  try {
    const subs = await QuestionnaireSubmission.find({ clientId: req.params.clientId }).sort({ submittedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
