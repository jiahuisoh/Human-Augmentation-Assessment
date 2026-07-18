const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const { requireClientAccess } = require("../middleware/access");
const { loginLimiter, registerLimiter } = require("../middleware/rateLimiters");
const userController = require("../controllers/userController");

// Mounted at /api/users.

// Mongoose casts ObjectId hex case-insensitively, but the self-access checks
// and the assignedClientIds $pull cascade compare strings case-sensitively.
// Normalize ids to their canonical lowercase form once, at the edge.
router.param("id", (req, res, next, id) => {
  req.params.id = id.toLowerCase();
  next();
});

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/", registerLimiter, userController.register);
router.post("/login", loginLimiter, userController.login);

// ── Authenticated ─────────────────────────────────────────────────────────────
// /me must stay above /:id or Express would match it as an id.
router.get("/me", verifyJWT, userController.getMe);
router.get("/:id", verifyJWT, userController.getUser);
router.patch("/:id/emergency", verifyJWT, userController.updateEmergencyContact);
router.patch("/:id/nric", verifyJWT, userController.updateNric);

// ── Measurements ──────────────────────────────────────────────────────────────
router.get("/:clientId/measurements", verifyJWT, requireClientAccess("clientId"), userController.listMeasurements);
router.post("/:clientId/measurements", verifyJWT, requireClientAccess("clientId"), userController.addMeasurement);

module.exports = router;
