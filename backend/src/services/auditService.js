const mongoose = require("mongoose");
const AuditLog = require("../models/Audit");

// Developers maintain the platform, so they read the categories that describe
// how it is *running* - the CV pipeline, the token contract, authentication
// behaviour and assessment activity. Deliberately excluded: ADMIN, CONSENT,
// PROFILE and AI, which describe decisions made about a particular person
// rather than the health of the system.
//
// Every record that does go out is stripped of who it was about first (see
// redactForDeveloper). This is the boundary; the console does not filter again,
// because a second copy of this list would be one more thing to drift.
const DEVELOPER_CATEGORIES = ["CONTRACT", "CV", "TOKEN", "AUTH", "ASSESSMENT"];

const scopeForRole = (role) => {
  if (role !== "developer") return {};
  // mongoose.trusted(): sanitizeFilter (config/db.js) would otherwise wrap this
  // code-authored $in in $eq, treating it as injected user input. The literal is
  // ours, not from the request.
  return { category: mongoose.trusted({ $in: DEVELOPER_CATEGORIES }) };
};

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

const REDACTED = "[redacted]";

// Context keys that name a person, whatever the category carrying them.
const SUBJECT_ID_KEYS = new Set(["clientId", "targetId", "patientId", "userId"]);

// Identifiers that live in the free-text message: an account email, or an id a
// message interpolated ("Intervention plan created for 6a1f…"). This is a
// backstop, not the guarantee - what actually keeps a clinical narrative out of
// the developer's view is DEVELOPER_CATEGORIES above. Both patterns are used
// only with String.replace, which resets lastIndex, so the /g flag is safe here.
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/gi;

const redactContext = (context) => {
  if (!context) return context;
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SUBJECT_ID_KEYS.has(key) ? REDACTED : value;
  }
  return out;
};

/**
 * Strip every trace of WHO an event concerned, keeping what it says about the
 * system. A developer can see that logins are failing, how often, and against
 * how many distinct accounts - never against whom.
 */
const redactForDeveloper = (log) => ({
  ...log,
  message: log.message.replace(EMAIL_PATTERN, REDACTED).replace(OBJECT_ID_PATTERN, REDACTED),
  // A client acting on their own account is the subject of that record, so the
  // actor id identifies them and goes. Staff ids are not patient data and stay,
  // because "which clinician did this" is a legitimate operational question.
  actorId: log.actorRole === "client" ? REDACTED : log.actorId,
  context: redactContext(log.context),
});

// `role` scopes the read: administrators see the trail as written; developers
// see the operational categories with every subject identifier removed.
// Callers must pass the authenticated actor's role.
const listLogs = async (limit, role) => {
  const logs = await AuditLog.find(scopeForRole(role))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return role === "developer" ? logs.map(redactForDeveloper) : logs;
};

module.exports = { writeAudit, listLogs };
