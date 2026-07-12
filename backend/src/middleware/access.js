// Central client-data authorization. Relies on req.user (set by verifyJWT),
// which carries role and assignedClientIds — so no extra DB query here.
const canAccessClient = (user, clientId) => {
  if (!user || !clientId) return false;
  if (user.role === "administrator") return true;
  if (user.id === clientId) return true; // your own record
  if (user.role === "clinician") return (user.assignedClientIds || []).includes(clientId);
  return false; // staff, developer, and anyone else: no access to identifiable client data
};

const requireClientAccess = (param = "clientId") => (req, res, next) => {
  if (!canAccessClient(req.user, req.params[param])) {
    return res.status(403).json({ error: "You do not have access to this client's data." });
  }
  next();
};

module.exports = { canAccessClient, requireClientAccess };
