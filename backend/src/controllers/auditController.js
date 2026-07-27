const asyncHandler = require("../utils/asyncHandler");
const auditService = require("../services/auditService");

// GET /api/audit
const listLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const logs = await auditService.listLogs(limit, req.user.role);
  res.json(logs);
});

module.exports = { listLogs };
