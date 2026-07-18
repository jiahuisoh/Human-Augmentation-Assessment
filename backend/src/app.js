const express = require("express");
const cors = require("cors");
const { securityHeaders, sensitiveDataHeaders, requireJsonContent } = require("./middleware/security");
const { globalLimiter } = require("./middleware/rateLimiters");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const apiRoutes = require("./routes");

// App assembly only
const app = express();

// Behind a reverse proxy / PaaS the real client IP arrives via X-Forwarded-For
// and req.ip would otherwise be the proxy's address - every rate limiter would
// then share one bucket across all users. TRUST_PROXY is the number of proxy
// hops to trust (e.g. 1 behind nginx/Render); unset or 0 means a direct
// connection, where trusting the header would let clients spoof their IP
const trustProxy = Number.parseInt(process.env.TRUST_PROXY || "0", 10);
if (Number.isInteger(trustProxy) && trustProxy > 0) 
  app.set("trust proxy", trustProxy);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(securityHeaders);
app.use(sensitiveDataHeaders);
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:4500",
  credentials: true,
}));
app.use(globalLimiter);
app.use(requireJsonContent);
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", apiRoutes);

// ── 404 + global error handler ────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
