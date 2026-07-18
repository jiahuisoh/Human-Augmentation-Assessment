// Guards for administrator account-lifecycle mutations (suspend / delete).
// Client-data authorization lives in access.js; these protect the *accounts*
// themselves. The last-administrator invariant (withAdminLock /
// hasOtherActiveAdmin) lives in services/admin.service.js.

// No admin action may target the actor's own account: self deletion not allowed
// an active actor guarantees the system always retains at least one working administrator.
const forbidSelfTarget = (message) => (req, res, next) => {
  if (req.params.id === req.user.id) {
    return res.status(403).json({ error: message });
  }
  next();
};

module.exports = { forbidSelfTarget };
