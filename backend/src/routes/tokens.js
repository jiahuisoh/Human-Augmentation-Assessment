const express = require("express");
const router = express.Router();
const Token = require("../models/Token");
const { RedemptionCatalogueItem } = require("../models/Misc");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");

// High-value threshold — awards above this require admin approval (per HANA CRM spec)
const HIGH_VALUE_THRESHOLD = 100;

// GET /api/tokens/balance/:clientId
router.get("/balance/:clientId", verifyJWT, async (req, res) => {
  try {
    const approved = await Token.find({ clientId: req.params.clientId, status: "approved" });
    const balance = approved.reduce((sum, t) => sum + t.amount, 0);
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tokens/history/:clientId
router.get("/history/:clientId", verifyJWT, async (req, res) => {
  try {
    const history = await Token.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tokens/pending — admin sees all pending approvals
router.get("/pending", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const pending = await Token.find({ requiresApproval: true, status: "pending" }).sort({ createdAt: -1 });
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens/award — system-triggered token award
router.post("/award", verifyJWT, async (req, res) => {
  try {
    const { clientId, amount, eventType, livenessScore, sessionId, reason } = req.body;
    const requiresApproval = amount >= HIGH_VALUE_THRESHOLD;
    const status = requiresApproval ? "pending" : "approved";

    const tx = await Token.create({
      clientId, amount, eventType, livenessScore, sessionId, reason,
      requiresApproval, status, issuedBy: req.user.id,
    });
    await writeAudit(req, "TOKEN", `Token awarded: ${amount} (${eventType})`, {
      clientId, amount, requiresApproval,
    });
    res.status(201).json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens/issue — manual token issue (clinician or admin)
router.post("/issue", verifyJWT, requireRole("clinician", "administrator"), async (req, res) => {
  try {
    const { clientId, amount, issuedBy, reason } = req.body;
    if (!reason) return res.status(400).json({ error: "reason required for manual issue" });

    const requiresApproval = req.user.role !== "administrator";
    const status = requiresApproval ? "pending" : "approved";

    const tx = await Token.create({
      clientId, amount, eventType: "manual_adjustment",
      issuedBy, reason, requiresApproval, status,
    });
    await writeAudit(req, "TOKEN", `Manual token issue: ${amount} for ${clientId}`, { reason }, "WARN");
    res.status(201).json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens/:id/approve — admin approves pending token
router.post("/:id/approve", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const tx = await Token.findByIdAndUpdate(req.params.id, {
      status: "approved", approvedBy: req.body.approverId, approvedAt: new Date().toISOString(),
    }, { new: true });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    await writeAudit(req, "TOKEN", `Token approved: ${tx.amount}`, { txId: tx._id });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens/:id/reject
router.post("/:id/reject", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const { approverId, reason } = req.body;
    const tx = await Token.findByIdAndUpdate(req.params.id, {
      status: "rejected", rejectedBy: approverId, rejectedAt: new Date().toISOString(), rejectionReason: reason,
    }, { new: true });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    await writeAudit(req, "TOKEN", `Token rejected`, { txId: tx._id, reason }, "WARN");
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens/:id/revoke — admin revokes with documented justification (per CRM spec)
router.post("/:id/revoke", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const { requestedBy, reason } = req.body;
    if (!reason) return res.status(400).json({ error: "reason required for revocation" });
    const tx = await Token.findByIdAndUpdate(req.params.id, {
      status: "revoked", revokedBy: requestedBy, revokedAt: new Date().toISOString(), revocationReason: reason,
    }, { new: true });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    await writeAudit(req, "TOKEN", `Token revoked`, { txId: tx._id, reason }, "WARN");
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tokens/catalogue
router.get("/catalogue", verifyJWT, async (req, res) => {
  try {
    const items = await RedemptionCatalogueItem.find({ active: true });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
