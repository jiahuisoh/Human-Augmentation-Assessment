const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const httpError = require("../utils/httpError");
const { writeAudit } = require("./auditService");

// Clients awaiting the in-person identity check (never verified, or sent back
// by an admin, or re-opened by an NRIC change). Staff are not entitled to
// client PII (see middleware/access.js).
const listPendingVerification = async () => {
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

  return clients.map((c) => ({
    _id: c._id.toString(),
    name: c.name,
    verificationStatus: c.verificationStatus,
    checked: Boolean(c.staffVerification),
    recommended: c.staffVerification?.recommended ?? null,
    createdAt: c.createdAt,
  }));
};

// In-person identity check: staff enter the full NRIC sighted on the client's
// physical card. It is compared (timing-safe) against the hash captured at
// registration, and the outcome is recorded as a recommendation flag with the
// account moved to "pending" - the final verified/unverified decision belongs
// to an administrator. Staff can never set "verified" directly.
const verifyNric = async (actor, targetId, nric) => {
  const user = await User.findById(targetId).select("role verificationStatus +nricHash");
  if (!user) throw httpError(404, "User not found");
  // Staff perform identity checks on clients only
  if (user.role !== "client") {
    throw httpError(403, "Only client accounts can be verified here.");
  }
  if (user.verificationStatus === "suspended") {
    throw httpError(409, "A suspended account cannot be verified.");
  }
  if (user.verificationStatus === "verified") {
    throw httpError(409, "This account is already verified.");
  }
  if (!user.nricHash) {
    throw httpError(409, "No NRIC is on file for this account, so identity cannot be checked.");
  }

  const match = await bcrypt.compare(nric, user.nricHash);

  await User.updateOne(
    { _id: targetId },
    {
      verificationStatus: "pending",
      staffVerification: { recommended: match, by: actor.id, at: new Date().toISOString() },
    },
    { runValidators: true },
  );
  await writeAudit(
    actor, "ADMIN",
    match
      ? "Staff NRIC check passed; account flagged for admin approval"
      : "Staff NRIC check FAILED; account flagged for admin review",
    { targetId, recommended: match },
    match ? "INFO" : "WARN",
  );

  // Staff are not entitled to client PII (see middleware/access.js) - return
  // the check outcome only, never the user document.
  return { match, verificationStatus: "pending" };
};

module.exports = { listPendingVerification, verifyNric };
