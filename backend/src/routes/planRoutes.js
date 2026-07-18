const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { requireClientAccess } = require("../middleware/access");
const planController = require("../controllers/planController");

// Mounted at /api/plans.

router.get("/client/:clientId", verifyJWT, requireClientAccess("clientId"), planController.latestForClient);
router.post("/", verifyJWT, requireRole("clinician", "administrator"), planController.create);

module.exports = router;
