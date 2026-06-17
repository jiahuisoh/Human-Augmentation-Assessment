require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const app = express();

// ── Connect to MongoDB Atlas ──────────────────────────────────────────────────
connectDB();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());

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

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
const userRoutes    = require("./routes/users");
const sessionRoutes = require("./routes/sessions");
const miscRoutes    = require("./routes/misc");

// Base user routes: /api/users/login, /me, /:id, /:id/emergency, /:clientId/measurements
app.use("/api/users",    userRoutes);

// Session routes
app.use("/api/sessions", sessionRoutes);

// All other routes: submissions, consent, audit, plans, schedule, questionnaires
app.use("/api", miscRoutes);

// Admin (/api/admin/users/*) and staff (/api/staff/users/*) routes are defined in the
// user router under /admin/* and /staff/* paths. Mounted at /api AFTER misc so misc's
// specific routes resolve first and the router's /:id catch-all only sees leftovers.
app.use("/api", userRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4502;
app.listen(PORT, () => {
  console.log(`HANA backend running on http://localhost:${PORT}`);
});
