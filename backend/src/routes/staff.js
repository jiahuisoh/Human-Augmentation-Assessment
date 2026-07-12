const express = require("express");
const router = express.Router();
const User = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");

// Mounted at /api/staff.

// POST /api/staff/users/:id/verify-nric
router.post("/users/:id/verify-nric", verifyJWT, requireRole("staff", "administrator"), async (req, res) => {
  try {
    const { nricLast4 } = req.body;
    if (!nricLast4) return res.status(400).json({ error: "nricLast4 required" });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { verificationStatus: "verified" },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    await writeAudit(req, "ADMIN", `NRIC verified for user`, { targetId: req.params.id });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
