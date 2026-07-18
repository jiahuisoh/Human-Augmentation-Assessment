const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const { requireClientAccess } = require("../middleware/access");
const consentController = require("../controllers/consentController");

// Mounted at /api/consent.

router.get("/:clientId", verifyJWT, requireClientAccess("clientId"), consentController.listForClient);
router.post("/:clientId", verifyJWT, requireClientAccess("clientId"), consentController.record);

module.exports = router;
