const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { requireClientAccess } = require("../middleware/access");
const aiController = require("../controllers/aiController");

// Mounted at /api/ai.

router.get("/pending/:clinicianId", verifyJWT, requireRole("clinician", "administrator"), aiController.listPending);
router.get("/client/:clientId", verifyJWT, requireRole("clinician", "administrator"), requireClientAccess("clientId"), aiController.listForClient);
router.post("/:id/approve", verifyJWT, requireRole("clinician", "administrator"), aiController.approve);
router.post("/:id/override", verifyJWT, requireRole("clinician", "administrator"), aiController.override);

module.exports = router;
