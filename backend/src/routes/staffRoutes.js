const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const staffController = require("../controllers/staffController");

// Mounted at /api/staff.

router.get("/clients/pending-verification", verifyJWT, requireRole("staff", "administrator"), staffController.listPendingVerification);
router.post("/users/:id/verify-nric", verifyJWT, requireRole("staff", "administrator"), staffController.verifyNric);

module.exports = router;
