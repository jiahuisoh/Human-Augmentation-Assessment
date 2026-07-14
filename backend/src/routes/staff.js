const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");
const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");

// Mounted at /api/staff.

// GET /api/staff/clients/pending-verification
// Clients awaiting the in-person identity check (never verified, or sent back by
// an admin, or re-opened by an NRIC change). Staff are not entitled to client PII
// (see middleware/access.js), so this projects the bare minimum needed to run the
// check: who to call up, and where they are in the workflow. Deliberately EXCLUDES
// email/dateOfBirth/height/weight/emergencyContact — and nricLastFour, which would
// let staff shortcut the very check they are performing.
router.get("/clients/pending-verification", verifyJWT, requireRole("staff", "administrator"), asyncHandler(async (req, res) => {
  const clients = await User.find(
    {
      role: "client",
      // mongoose.trusted(): sanitizeFilter (config/db.js) would otherwise wrap this
      // code-authored $in in $eq, treating it as injected user input. The literal is
      // ours, not from the request.
      verificationStatus: mongoose.trusted({ $in: ["unverified", "pending"] }),
    },
    "name verificationStatus staffVerification createdAt",
  ).sort({ createdAt: 1 }).lean();

  res.json(clients.map((c) => ({
    _id: c._id.toString(),
    name: c.name,
    verificationStatus: c.verificationStatus,
    checked: Boolean(c.staffVerification),
    recommended: c.staffVerification?.recommended ?? null,
    createdAt: c.createdAt,
  })));
}));

// POST /api/staff/users/:id/verify-nric
// In-person identity check: staff enter the full NRIC sighted on the client's
// physical card. It is compared (timing-safe) against the hash captured at
// registration, and the outcome is recorded as a recommendation flag with the
// account moved to "pending" — the final verified/unverified decision belongs
// to an administrator. Staff can never set "verified" directly.
router.post("/users/:id/verify-nric", verifyJWT, requireRole("staff", "administrator"), asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    nric: { type: "nric", required: true },
  });
  if (!ok) return validationFailed(res, fields);

  const user = await User.findById(req.params.id).select("role verificationStatus +nricHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  // Staff perform identity checks on clients only — never on other roles' accounts.
  if (user.role !== "client") {
    return res.status(403).json({ error: "Only client accounts can be verified here." });
  }
  if (user.verificationStatus === "suspended") {
    return res.status(409).json({ error: "A suspended account cannot be verified." });
  }
  if (user.verificationStatus === "verified") {
    return res.status(409).json({ error: "This account is already verified." });
  }
  if (!user.nricHash) {
    return res.status(409).json({ error: "No NRIC is on file for this account, so identity cannot be checked." });
  }

  const match = await bcrypt.compare(values.nric, user.nricHash);

  await User.updateOne(
    { _id: req.params.id },
    {
      verificationStatus: "pending",
      staffVerification: { recommended: match, by: req.user.id, at: new Date().toISOString() },
    },
    { runValidators: true },
  );
  await writeAudit(
    req, "ADMIN",
    match
      ? "Staff NRIC check passed; account flagged for admin approval"
      : "Staff NRIC check FAILED; account flagged for admin review",
    { targetId: req.params.id, recommended: match },
    match ? "INFO" : "WARN",
  );

  // Staff are not entitled to client PII (see middleware/access.js) — return the
  // check outcome only, never the user document.
  res.json({ match, verificationStatus: "pending" });
}));

module.exports = router;
