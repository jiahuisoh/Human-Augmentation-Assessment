const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { requireClientAccess, requireVerifiedClient } = require("../middleware/access");
const sessionController = require("../controllers/sessionController");

// Mounted at /api/sessions.

// Grant first, then the signed result. Same gate on both: a client must be
// verified before any of their assessment data is produced or stored.
router.post("/cv-grant", verifyJWT, requireVerifiedClient, sessionController.createCvGrant);
router.post("/", verifyJWT, requireVerifiedClient, sessionController.createSession);
router.get("/client/:clientId", verifyJWT, requireClientAccess("clientId"), sessionController.listForClient);
router.patch("/:id/override", verifyJWT, requireRole("clinician", "administrator"), sessionController.overrideScore);
router.delete("/:id", verifyJWT, requireRole("clinician", "administrator"), sessionController.deleteSession);

module.exports = router;
