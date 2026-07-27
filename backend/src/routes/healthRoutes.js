const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const healthController = require("../controllers/healthController");

// Mounted at /api/health. Developers maintain the platform, so they may see
// service detail - it names no client and carries no PII.
router.get("/", verifyJWT, requireRole("developer", "administrator"), healthController.systemHealth);

module.exports = router;
