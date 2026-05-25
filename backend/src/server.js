require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const app = express();

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:4500",
  credentials: true,
}));

// Rate limiting — 100 requests per 15 minutes per IP
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
const userRoutes = require("./routes/users");
const sessionRoutes = require("./routes/sessions");
const tokenRoutes = require("./routes/tokens");
const miscRoutes = require("./routes/misc");

// User routes handle /api/users, /api/admin/users, /api/staff/users
app.use("/api/users",       userRoutes);
app.use("/api/admin",       userRoutes);
app.use("/api/staff",       userRoutes);
app.use("/api/sessions",    sessionRoutes);
app.use("/api/tokens",      tokenRoutes);

// Misc routes handle submissions, consent, audit, ai, plans, contracts, schedule, questionnaires
app.use("/api", miscRoutes);

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
