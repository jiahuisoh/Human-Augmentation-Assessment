const AuditLog = require("../models/Audit");

/**
 * writeAudit(req, category, message, context, level)
 * Call inside route handlers for all sensitive actions.
 * Failures never break the main request flow.
 */
const writeAudit = async (req, category, message, context = {}, level = "INFO") => {
  try {
    await AuditLog.create({
      actorId:   req.user?.id || "system",
      actorRole: req.user?.role || "system",
      category,
      level,
      message,
      context,
    });
  } catch (err) {
    console.error("Audit write failed:", err.message);
  }
};

module.exports = writeAudit;
