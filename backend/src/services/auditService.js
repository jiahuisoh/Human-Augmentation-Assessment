const AuditLog = require("../models/Audit");

/**
 * writeAudit(actor, category, message, context, level)
 * `actor` is the authenticated principal performing the sensitive action -
 * pass req.user, or a plain { id, role } when no request context exists yet
 * (e.g. during login). Failures never break the main request flow.
 */
const writeAudit = async (actor, category, message, context = {}, level = "INFO") => {
  try {
    await AuditLog.create({
      actorId:   actor?.id || "system",
      actorRole: actor?.role || "system",
      category,
      level,
      message,
      context,
    });
  } catch (err) {
    console.error("Audit write failed:", err.message);
  }
};

const listLogs = (limit) =>
  AuditLog.find().sort({ createdAt: -1 }).limit(limit);

module.exports = { writeAudit, listLogs };
