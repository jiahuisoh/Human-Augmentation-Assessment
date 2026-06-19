const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { Measurement } = require("../models/Misc");
const { signToken } = require("../utils/jwt");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
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

// GET /api/users/:id
router.get("/:id", verifyJWT, async (req, res) => {
  try {
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
router.get("/:clientId/measurements", verifyJWT, async (req, res) => {
  try {
    const measurements = await Measurement.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json(measurements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:clientId/measurements
router.post("/:clientId/measurements", verifyJWT, async (req, res) => {
  try {
    const { height, weight } = req.body;
    if (!height || !weight) return res.status(400).json({ error: "height and weight required" });

    const bmi = parseFloat((weight / ((height / 100) ** 2)).toFixed(1));
    const m = await Measurement.create({ clientId: req.params.clientId, height, weight, bmi });

    // Sync latest measurements back to user document
    await User.findByIdAndUpdate(req.params.clientId, { height, weight });

    res.status(201).json(m);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get("/admin/users", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
router.post("/admin/users", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const { email, password, name, role, dateOfBirth, gender, height, weight } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: "email, password, name and role are required" });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({ email, password, name, role, dateOfBirth, gender, height, weight });
    await writeAudit(req, "ADMIN", `Admin created user: ${email} (${role})`, { targetId: user._id });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/status
router.patch("/admin/users/:id/status", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const { verificationStatus } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { verificationStatus }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    await writeAudit(req, "ADMIN", `User status updated to ${verificationStatus}`, { targetId: req.params.id });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:clinicianId/assign-client
// Admin assigns or unassigns a client to a clinician
router.patch("/admin/users/:clinicianId/assign-client", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    const { clientId, assign } = req.body;
    if (!clientId || assign === undefined) {
      return res.status(400).json({ error: "clientId and assign (boolean) are required" });
    }
    const update = assign
      ? { $addToSet: { assignedClientIds: clientId } }  // add without duplicates
      : { $pull: { assignedClientIds: clientId } };     // remove

    const clinician = await User.findByIdAndUpdate(req.params.clinicianId, update, { new: true });
    if (!clinician) return res.status(404).json({ error: "Clinician not found" });

    await writeAudit(req, "ADMIN", `Client ${assign ? "assigned to" : "removed from"} clinician`, {
      clinicianId: req.params.clinicianId, clientId,
    });
    res.json(clinician);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/admin/users/:id", verifyJWT, requireRole("administrator"), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await writeAudit(req, "ADMIN", `User deleted`, { targetId: req.params.id }, "WARN");
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Staff routes ──────────────────────────────────────────────────────────────

// POST /api/staff/users/:id/verify-nric
router.post("/staff/users/:id/verify-nric", verifyJWT, requireRole("staff", "administrator"), async (req, res) => {
  try {
    const { nricLast4 } = req.body;
    if (!nricLast4) return res.status(400).json({ error: "nricLast4 required" });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { verificationStatus: "verified" },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    await writeAudit(req, "ADMIN", `NRIC verified for user`, { targetId: req.params.id, nricLast4 });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
