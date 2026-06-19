const express = require("express");
const router = express.Router();
const Session = require("../models/Session");
const User = require("../models/User");
const Consent = require("../models/Consent");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");

// POST /api/sessions — save() — CV result lands here after test completes
router.post("/", verifyJWT, async (req, res) => {
  try {
    // Staff must be verified before conducting tests (HANA CRM spec)
    if (req.user.role === "staff") {
      const conductor = await User.findById(req.user.id);
      if (!conductor || conductor.verificationStatus !== "verified") {
        return res.status(403).json({ error: "Staff account not verified. Please complete NRIC verification first." });
      }
    }

    // PDPA: only check consent for client-initiated sessions
    // Clinician-conducted sessions assume consent was obtained at onboarding
    if (req.user.role === "client") {
      const consent = await Consent.findOne({
        clientId: req.body.clientId,
        scope: "assessment_data",
        granted: true,
      });
      if (!consent) {
        return res.status(403).json({ error: "Client has not consented to assessment data collection." });
      }
    }

    const session = await Session.create(req.body);
    await writeAudit(req, "ASSESSMENT", `Assessment session saved: ${session.testId}`, {
      sessionId: session._id, clientId: session.clientId,
    });
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/client/:clientId — listForClient()
router.get("/client/:clientId", verifyJWT, async (req, res) => {
  try {
    // Clinicians can only see their assigned clients (HANA CRM spec)
    if (req.user.role === "clinician") {
      const clinician = await User.findById(req.user.id);
      if (!clinician.assignedClientIds?.includes(req.params.clientId)) {
        return res.status(403).json({ error: "Not assigned to this client" });
      }
    }
    const sessions = await Session.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sessions/:id/override — override()
// Clinician/admin can override a score with mandatory reason — full audit trail
router.patch("/:id/override", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { byUserId, byRole, reason, originalScore, newScore } = req.body;
    if (!reason) return res.status(400).json({ error: "reason is required for override" });

    const session = await Session.findByIdAndUpdate(
      req.params.id,
      { $push: { overrides: { by: byUserId, byRole, reason, originalScore, newScore, at: new Date().toISOString() } } },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: "Session not found" });
    await writeAudit(req, "ASSESSMENT", `Score overridden from ${originalScore} to ${newScore}`, {
      sessionId: req.params.id, reason,
    }, "WARN");
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
