const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");

// mongoose.connection.readyState is an index into this list.
const READY_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

// A dashboard asking "is anything hung?" must not itself hang on a dead socket.
const PING_TIMEOUT_MS = 3000;

const withTimeout = async (promise, ms, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); }),
    ]);
  } finally {
    clearTimeout(timer); // otherwise a winning ping leaves the timer holding the loop
  }
};

// readyState can still read "connected" after the server has gone away, so the
// check is a real round-trip rather than a cached flag.
const pingDatabase = async () => {
  const state = READY_STATES[mongoose.connection.readyState] || "unknown";
  const name = mongoose.connection.name || null;
  if (state !== "connected" || !mongoose.connection.db) {
    return { state, name, ok: false, pingMs: null };
  }
  const started = Date.now();
  try {
    await withTimeout(mongoose.connection.db.admin().ping(), PING_TIMEOUT_MS, "Database ping timed out");
    return { state, name, ok: true, pingMs: Date.now() - started };
  } catch {
    return { state, name, ok: false, pingMs: null };
  }
};

// GET /api/health - detail for the developer console. The unauthenticated
// liveness probe stays at /health; this one names the database and the process,
// so it is developer/administrator only.
const systemHealth = asyncHandler(async (req, res) => {
  const database = await pingDatabase();
  // Presence only. The value is the key the CV service verifies grants with,
  // and a mismatch between the two services is the usual setup failure - so
  // "is it set at all" is worth reporting and the secret itself never is.
  const cvSigningSecret = process.env.CV_SIGNING_SECRET ? "configured" : "missing";

  res.json({
    status: database.ok && cvSigningSecret === "configured" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    node: process.version,
    database,
    cvSigningSecret,
  });
});

module.exports = { systemHealth };
