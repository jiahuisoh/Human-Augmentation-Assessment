const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const scheduleController = require("../controllers/scheduleController");

// Mounted at /api/schedule.

router.get("/today", verifyJWT, requireRole("staff", "administrator"), scheduleController.listToday);
router.patch("/:id/attendance", verifyJWT, requireRole("staff", "administrator"), scheduleController.setAttendance);

module.exports = router;
