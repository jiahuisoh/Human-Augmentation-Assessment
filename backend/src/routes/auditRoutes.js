const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const auditController = require("../controllers/auditController");

// Mounted at /api/audit.

// Developers are admitted for the technical categories only; the service scopes
// the query by role, so the route gate alone never decides what they can read.
router.get("/", verifyJWT, requireRole("administrator", "developer"), auditController.listLogs);

module.exports = router;
