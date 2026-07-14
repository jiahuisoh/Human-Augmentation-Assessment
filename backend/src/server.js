require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const connectDB = require("./config/db");

// Tokens signed with an empty secret would be forgeable — refuse to boot.
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set — refusing to start.");
  process.exit(1);
}

const app = express();

// ── Connect to MongoDB Atlas ──────────────────────────────────────────────────
connectDB();

// ── Security middleware ───────────────────────────────────────────────────────
// JSON-only API: nothing may frame it or execute from it.
app.use(helmet({
  frameguard: { action: "deny" },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
}));

// API responses carry personal health data: never cache, never index.
app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Permissions-Policy": "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  });
  next();
});

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:4500",
  credentials: true,
}));

// Rate limiting: 100 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
}));

// Reject non-JSON bodies up front (express.json would silently skip them,
// leaving req.body empty and turning the real problem into a confusing 400).
app.use((req, res, next) => {
  const hasBody = ["POST", "PUT", "PATCH"].includes(req.method)
    && Number(req.headers["content-length"] || 0) > 0;
  if (hasBody && !req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }
  next();
});

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
const userRoutes    = require("./routes/users");
const adminRoutes   = require("./routes/admin");
const staffRoutes   = require("./routes/staff");
const sessionRoutes = require("./routes/sessions");
const miscRoutes    = require("./routes/misc");

app.use("/api/users",    userRoutes);
app.use("/api/admin",    adminRoutes);
app.use("/api/staff",    staffRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api",          miscRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Routes forward errors here via asyncHandler(next). Client-safe responses only:
// known Mongoose/Mongo errors map to 4xx; anything unexpected is a generic 500
// with a requestId that ties the response to the full server-side log line.
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let expose = err.expose === true;
  let message = err.message;

  if (err.name === "ValidationError")        { status = 400; expose = true; message = "Invalid input"; }
  else if (err.name === "CastError")         { status = 400; expose = true; message = "Invalid identifier"; }
  else if (err.code === 11000)               { status = 409; expose = true; message = "Duplicate value"; }
  else if (err.name === "JsonWebTokenError") { status = 401; expose = true; message = "Invalid token"; }
  else if (err.type === "entity.parse.failed")   { status = 400; expose = true; message = "Request body is not valid JSON"; }
  else if (err.type === "entity.too.large")      { status = 413; expose = true; message = "Request body is too large"; }

  const requestId = crypto.randomUUID();
  if (status >= 500) console.error(`[${requestId}] ${req.method} ${req.originalUrl} —`, err);

  res.status(status).json({
    error: expose ? message : "Internal server error",
    requestId,
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4502;
app.listen(PORT, () => {
  console.log(`HANA backend running on http://localhost:${PORT}`);
});
