const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const { requireClientAccess, requireVerifiedClient } = require("../middleware/access");
const questionnaireController = require("../controllers/questionnaireController");

// Mounted at /api/questionnaires.

router.post("/", verifyJWT, requireVerifiedClient, questionnaireController.submit);
router.get("/client/:clientId", verifyJWT, requireClientAccess("clientId"), questionnaireController.listForClient);

module.exports = router;
