const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { Measurement } = require("../models/Misc");
const { signToken } = require("../utils/jwt");
const verifyJWT = require("../middleware/verifyJWT");
const { canAccessClient, requireClientAccess } = require("../middleware/access");
const writeAudit = require("../middleware/auditLogger");

// ── Public routes ─────────────────────────────────────────────────────────────

// POST /api/users — register new client
router.post("/", async (req, res) => {
  try {
    const { email, password, name, dateOfBirth, gender, height, weight } = req.body;
    if (!email || !password || !name || !dateOfBirth || !gender) {
      return res.status(400).json({ error: "email, password, name, dateOfBirth and gender are required" });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({ email, password, name, dateOfBirth, gender, height, weight, role: "client" });
    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (user.verificationStatus === "suspended") {
      await writeAudit({ user: { id: user._id, role: user.role } }, "AUTH", `Suspended account login blocked: ${email}`, { userId: user._id }, "WARN");
      return res.status(403).json({ error: "Your account has been suspended. Please contact staff or administrator if you believe this is an error." });
    }
    const token = signToken(user);
    await writeAudit({ user: { id: user._id, role: user.role } }, "AUTH", `User logged in: ${email}`, { userId: user._id });
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Authenticated routes ──────────────────────────────────────────────────────

// GET /api/users/me
router.get("/me", verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — self, an assigned client (clinician), or anyone (admin)
router.get("/:id", verifyJWT, async (req, res) => {
  try {
    if (!canAccessClient(req.user, req.params.id)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/emergency
router.patch("/:id/emergency", verifyJWT, async (req, res) => {
  try {
    if (req.user.role !== "administrator" && req.user.id !== req.params.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { emergencyContact: req.body }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Measurements ──────────────────────────────────────────────────────────────

// GET /api/users/:clientId/measurements
router.get("/:clientId/measurements", verifyJWT, requireClientAccess("clientId"), async (req, res) => {
  try {
    const measurements = await Measurement.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(measurements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:clientId/measurements
router.post("/:clientId/measurements", verifyJWT, requireClientAccess("clientId"), async (req, res) => {
  try {
    const { height, weight } = req.body;
    if (!height || !weight) return res.status(400).json({ error: "height and weight required" });

    const bmi = parseFloat((weight / ((height / 100) ** 2)).toFixed(1));
    const m = await Measurement.create({ clientId: req.params.clientId, height, weight, bmi });

    // Sync latest measurements back to the user document
    await User.findByIdAndUpdate(req.params.clientId, { height, weight });

    res.status(201).json(m);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
