const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const verifyJWT = require("../middleware/verifyJWT");
const requireRole = require("../middleware/requireRole");
const writeAudit = require("../middleware/auditLogger");
const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");

const ROLES = ["client", "staff", "clinician", "developer", "administrator"];
const STATUSES = ["unverified", "pending", "verified", "suspended"];

// All admin routes are administrator-only. Mounted at /api/admin.
router.use(verifyJWT, requireRole("administrator"));

// GET /api/admin/users
router.get("/users", asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
}));

// POST /api/admin/users
router.post("/users", asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    email:       { type: "email", required: true },
    password:    { type: "password", required: true },
    name:        { type: "string", required: true, max: 120, label: "Name" },
    role:        { type: "enum", required: true, values: ROLES, label: "Role" },
    dateOfBirth: { type: "date", label: "Date of birth" },
    gender:      { type: "enum", values: ["male", "female", "other"], label: "Gender" },
    nric:        { type: "nric" },
    height:      { type: "number", min: 100, max: 250, label: "Height" },
    weight:      { type: "number", min: 20, max: 300, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);
  const { email, password, name, role, dateOfBirth, gender, height, weight, nric } = values;

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const user = await User.create({
    email, password, name, role, dateOfBirth, gender, height, weight,
    nricHash: nric ? await bcrypt.hash(nric, 12) : undefined,
    nricLastFour: nric ? nric.slice(-4) : undefined,
  });
  await writeAudit(req, "ADMIN", `Admin created user: ${email} (${role})`, { targetId: user._id });
  res.status(201).json(user);
}));

// PATCH /api/admin/users/:id/status
router.patch("/users/:id/status", asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    verificationStatus: { type: "enum", required: true, values: STATUSES, label: "verificationStatus" },
  });
  if (!ok) return validationFailed(res, fields);
  const { verificationStatus } = values;
  const user = await User.findByIdAndUpdate(req.params.id, { verificationStatus }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ error: "User not found" });
  // Assignment requires a verified identity, so losing "verified" (unverified,
  // pending or suspended) also removes the client from every clinician's list.
  // Re-assignment happens only after the full staff-then-admin re-verification.
  if (verificationStatus !== "verified") {
    await User.updateMany(
      { assignedClientIds: req.params.id },
      { $pull: { assignedClientIds: req.params.id } },
    );
  }
  await writeAudit(req, "ADMIN", `User status updated to ${verificationStatus}`, { targetId: req.params.id });
  res.json(user);
}));

// PATCH /api/admin/users/:clinicianId/assign-client
router.patch("/users/:clinicianId/assign-client", asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    clientId: { type: "objectId", required: true, label: "clientId" },
    assign:   { type: "boolean", required: true, label: "assign" },
  });
  if (!ok) return validationFailed(res, fields);
  const { clientId, assign } = values;
  if (assign) {
    const client = await User.findById(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });
    if (client.verificationStatus === "suspended") {
      return res.status(409).json({ error: "Cannot assign a suspended client to a clinician." });
    }
    if (client.verificationStatus !== "verified") {
      return res.status(409).json({ error: "Only verified clients can be assigned to a clinician." });
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
}));

// DELETE /api/admin/users/:id
router.delete("/users/:id", asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  await User.updateMany(
    { assignedClientIds: req.params.id },
    { $pull: { assignedClientIds: req.params.id } },
  );
  await writeAudit(req, "ADMIN", `User deleted`, { targetId: req.params.id }, "WARN");
  res.json({ message: "User deleted" });
}));

module.exports = router;
