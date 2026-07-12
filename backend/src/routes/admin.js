const express = require("express");
const router = express.Router();
const User = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");

// All admin routes are administrator-only. Mounted at /api/admin.
router.use(verifyJWT, requireRole("administrator"));

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
router.post("/users", async (req, res) => {
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
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { verificationStatus } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { verificationStatus }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (verificationStatus === "suspended") {
      await User.updateMany(
        { assignedClientIds: req.params.id },
        { $pull: { assignedClientIds: req.params.id } },
      );
    }
    await writeAudit(req, "ADMIN", `User status updated to ${verificationStatus}`, { targetId: req.params.id });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:clinicianId/assign-client
router.patch("/users/:clinicianId/assign-client", async (req, res) => {
  try {
    const { clientId, assign } = req.body;
    if (!clientId || assign === undefined) {
      return res.status(400).json({ error: "clientId and assign (boolean) are required" });
    }
    if (assign) {
      const client = await User.findById(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });
      if (client.verificationStatus === "suspended") {
        return res.status(409).json({ error: "Cannot assign a suspended client to a clinician." });
      }
    }
    const update = assign
      ? { $addToSet: { assignedClientIds: clientId } }
      : { $pull: { assignedClientIds: clientId } };

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
router.delete("/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await User.updateMany(
      { assignedClientIds: req.params.id },
      { $pull: { assignedClientIds: req.params.id } },
    );
    await writeAudit(req, "ADMIN", `User deleted`, { targetId: req.params.id }, "WARN");
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
