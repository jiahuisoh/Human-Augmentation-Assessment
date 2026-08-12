const router = require("express").Router();

// One mount point per resource; the final URLs are unchanged from the
// pre-restructure API (frontend/src/utils/api.ts relies on them).
router.use("/users", require("./userRoutes"));
router.use("/admin", require("./adminRoutes"));
router.use("/staff", require("./staffRoutes"));
router.use("/sessions", require("./sessionRoutes"));
router.use("/consent", require("./consentRoutes"));
router.use("/audit", require("./auditRoutes"));
router.use("/plans", require("./planRoutes"));
router.use("/schedule", require("./scheduleRoutes"));
router.use("/questionnaires", require("./questionnaireRoutes"));
router.use("/health", require("./healthRoutes"));

module.exports = router;
