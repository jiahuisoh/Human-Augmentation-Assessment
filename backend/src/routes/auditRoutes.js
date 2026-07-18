const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const auditController = require("../controllers/auditController");

// Mounted at /api/audit.

router.get("/", verifyJWT, requireRole("administrator"), auditController.listLogs);

module.exports = router;
