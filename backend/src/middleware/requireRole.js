/**
 * requireRole(...roles)
 * Usage: router.get("/path", verifyJWT, requireRole("administrator"), handler)
 * Per HANA CRM spec - enforces least privilege per role
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorised" });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. Required role: ${roles.join(" or ")}` });
  }
  next();
};

module.exports = requireRole;
