const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { requireClientAccess, requireVerifiedClient } = require("../middleware/access");
const sessionController = require("../controllers/sessionController");

// Mounted at /api/sessions.

router.post("/", verifyJWT, requireVerifiedClient, sessionController.createSession);
router.get("/client/:clientId", verifyJWT, requireClientAccess("clientId"), sessionController.listForClient);
router.patch("/:id/override", verifyJWT, requireRole("clinician", "administrator"), sessionController.overrideScore);

module.exports = router;
