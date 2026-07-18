const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { forbidSelfTarget } = require("../middleware/adminGuard");
const adminController = require("../controllers/adminController");

// All admin routes are administrator-only. Mounted at /api/admin.
router.use(verifyJWT, requireRole("administrator"));

// Mongoose casts ObjectId hex case-insensitively (findById("507F…") hits the
// same document as "507f…"), but every string comparison and $pull cascade is
// case-sensitive. Normalize once so a mixed-case URL id can't slip past the
// self-target guard or leave stale entries behind in assignedClientIds.
router.param("id", (req, res, next, id) => {
  req.params.id = id.toLowerCase();
  next();
});

router.get("/users", adminController.listUsers);
router.post("/users", adminController.createUser);
router.patch("/users/:id/status", forbidSelfTarget("You cannot change your own account status."), adminController.setUserStatus);
router.patch("/users/:clinicianId/assign-client", adminController.assignClient);
router.delete("/users/:id", forbidSelfTarget("You cannot delete your own account."), adminController.deleteUser);

module.exports = router;
