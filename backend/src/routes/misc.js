const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");
const Consent = require("../models/Consent");
const AuditLog = require("../models/Audit");
const Session = require("../models/Session");
const Token = require("../models/Token");
const { AIRecommendation, InterventionPlan, ScheduleEntry, SmartContract, QuestionnaireSubmission } = require("../models/Misc");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");

// ══════════════════════════════════════════════════════════════════════════════
// SUBMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/submissions/video
router.post("/submissions/video", verifyJWT, async (req, res) => {
  try {
    const sub = await Submission.create({ ...req.body, status: "pending", submittedAt: new Date().toISOString() });
    await writeAudit(req, "CV", `Video submitted for ${sub.testId}`, { submissionId: sub._id, clientId: sub.clientId });
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

// GET /api/submissions/pending — clinician/admin sees all pending
router.get("/submissions/pending", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const subs = await Submission.find({ status: "pending" }).sort({ submittedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/submissions/:id — client deletes own submission
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

// POST /api/submissions/:id/approve — clinician/admin review creates session + awards tokens
router.post("/submissions/:id/approve", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { reviewerId, reviewerRole, reps, measurement, classification, notes } = req.body;

    // 1. Create assessment session from review
    const session = await Session.create({
      clientId: (await Submission.findById(req.params.id)).clientId,
      conductedBy: reviewerId,
      testId: (await Submission.findById(req.params.id)).testId,
      reps, measurement, classification,
    });

    // 2. Update submission
    const sub = await Submission.findByIdAndUpdate(req.params.id, {
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewerNotes: notes,
      resultingSessionId: session._id.toString(),
    }, { new: true });

    // 3. Auto-award tokens for assessment completion
    await Token.create({
      clientId: sub.clientId,
      amount: 10,
      eventType: "assessment_complete",
      issuedBy: reviewerId,
      reason: `${sub.testId} assessment approved`,
      requiresApproval: false,
      status: "approved",
    });

    await writeAudit(req, "CV", `Submission approved, session created`, {
      submissionId: req.params.id, sessionId: session._id,
    });

    res.json({ submission: sub, session });
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

// POST /api/consent/:clientId — client sets consent (explicit + traceable per CRM spec)
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
// AUDIT
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/audit — admin only
router.get("/audit", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/audit — write audit entry
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

// GET /api/ai/pending/:clinicianId
router.get("/ai/pending/:clinicianId", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const recs = await AIRecommendation.find({ assignedTo: req.params.clinicianId, status: "pending" });
    res.json(recs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/:id/approve — clinician approves AI recommendation
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

// POST /api/ai/:id/override — clinician overrides with reason (per CRM spec)
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

// POST /api/plans — clinician/admin creates plan
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
// SMART CONTRACTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/contracts
router.get("/contracts", verifyJWT, requireRole("developer", "administrator"), async (req, res) => {
  try {
    const contracts = await SmartContract.find().sort({ createdAt: -1 });
    res.json(contracts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contracts/:id/request-deploy
router.post("/contracts/:id/request-deploy", verifyJWT, requireRole("developer", "administrator"), async (req, res) => {
  try {
    const contract = await SmartContract.findByIdAndUpdate(req.params.id, {
      requestedBy: req.body.requestedBy, needsAdminApproval: true,
    }, { new: true });
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    await writeAudit(req, "CONTRACT", `Deployment requested for ${contract.name}`, { contractId: contract._id }, "WARN");
    res.json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contracts/:id/approve-deploy — admin final approval
router.post("/contracts/:id/approve-deploy", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const contract = await SmartContract.findByIdAndUpdate(req.params.id, {
      status: "live", approvedBy: req.body.approvedBy, deployedAt: new Date().toISOString(), needsAdminApproval: false,
    }, { new: true });
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    await writeAudit(req, "CONTRACT", `Contract deployed: ${contract.name}`, { contractId: contract._id }, "WARN");
    res.json(contract);
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
