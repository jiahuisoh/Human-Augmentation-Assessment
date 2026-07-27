const router = require("express").Router();
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const { requireClientAccess } = require("../middleware/access");
const scheduleController = require("../controllers/scheduleController");

// Mounted at /api/schedule.
//
// Booking belongs to the clinician the patient is assigned to: deciding that an
// assessment is due is a clinical judgement. Administrators supervise the
// platform and can read the result, but they have no booking screen, and a
// permission reachable only by hand-crafted request is one nobody audits.
// The front desk reads the day and records attendance, neither of which needs
// access to clinical data.

router.post("/", verifyJWT, requireRole("clinician"), scheduleController.create);
router.get("/today", verifyJWT, requireRole("staff", "administrator"), scheduleController.listToday);
router.get("/client/:clientId", verifyJWT, requireClientAccess("clientId"), scheduleController.listForClient);
router.patch("/:id/attendance", verifyJWT, requireRole("staff", "administrator"), scheduleController.setAttendance);
router.delete("/:id", verifyJWT, requireRole("clinician", "administrator"), scheduleController.cancel);

module.exports = router;
