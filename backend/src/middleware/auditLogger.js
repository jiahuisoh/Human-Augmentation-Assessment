const AuditLog = require("../models/Audit");

/**
 * writeAudit(req, category, message, context, level)
 * Call this inside any route handler that needs to be logged.
 * Per HANA CRM spec - all sensitive actions must be logged and timestamped.
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
    // Audit failure should never break the main request
    console.error("Audit write failed:", err.message);
  }
};

module.exports = writeAudit;
