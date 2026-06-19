/**
 * requireRole(...roles)
 * Usage: router.get("/path", verifyJWT, requireRole("administrator"), handler)
 * Enforces HANA CRM role-based access control per spec
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorised" });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. Required: ${roles.join(" or ")}` });
  }
  next();
};

module.exports = requireRole;
