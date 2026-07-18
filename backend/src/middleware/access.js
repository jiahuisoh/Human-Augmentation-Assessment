// Central client-data authorization. Relies on req.user (set by verifyJWT),
// which carries role and assignedClientIds — so no extra DB query here.
// Ids are compared as strings, and the stored canonical form is lowercase hex
// (ObjectId.toString()), but Mongoose *casts* hex case-insensitively, so an
// uppercase id in a URL would reach the same document while skipping every
// string comparison.
const canAccessClient = (user, clientId) => {
  if (!user || typeof clientId !== "string" || clientId === "") return false;
  const id = clientId.toLowerCase();
  if (user.role === "administrator") return true;
  if (user.id === id) return true; // your own record
  if (user.role === "clinician") return (user.assignedClientIds || []).includes(id);
  return false; // staff, developer, and anyone else: no access to identifiable client data
};

const requireClientAccess = (param = "clientId") => (req, res, next) => {
  // Rewrite the param to its canonical form so downstream queries
  // (find({clientId: req.params...})) match what the database stores.
  if (typeof req.params[param] === "string") {
    req.params[param] = req.params[param].toLowerCase();
  }
  if (!canAccessClient(req.user, req.params[param])) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }
  next();
};

// Clients must complete identity verification (staff NRIC check + admin
// approval) before submitting assessment data. Applies to client actors only —
// clinicians/admins acting on a client's behalf are gated by access rules above.
const requireVerifiedClient = (req, res, next) => {
  if (req.user?.role === "client" && req.user.verificationStatus !== "verified") {
    return res.status(403).json({
      error: "Your account must be verified before you can use this feature. Please visit your clinic with your NRIC.",
      code: "ACCOUNT_UNVERIFIED",
    });
  }
  next();
};

module.exports = { canAccessClient, requireClientAccess, requireVerifiedClient };
