const asyncHandler = require("../utils/asyncHandler");
const { validEmail, strongPassword, validate, validationFailed } = require("../utils/validators");
const { nameMax, weightLimits, heightLimits } = require("../utils/constants");
const { canViewClientProfile } = require("../middleware/access");
const userService = require("../services/userService");

// POST /api/users
const register = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    email:       { type: "email", required: true },
    password:    { type: "password", required: true },
    name:        { type: "string", required: true, max: nameMax, label: "Name" },
    dateOfBirth: { type: "birthDate", required: true, label: "Date of birth" },
    gender:      { type: "enum", required: true, values: ["male", "female", "other"], label: "Gender" },
    nric:        { type: "nric", required: true },
    height:      { type: "number", ...heightLimits, label: "Height" },
    weight:      { type: "number", ...weightLimits, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);

  const { user, token } = await userService.register(values);
  res.status(201).json({ user, token });
});

// POST /api/users/login
const login = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const { password } = req.body;
  if (!validEmail(email) || typeof password !== "string" || password === "" || password.length > 1024) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const { user, token } = await userService.login(email, password);
  res.json({ user, token });
});

// GET /api/users/me
const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user.id);
  res.json(user);
});

// GET /api/users/:id - self, an assigned client (clinician), any client
// profile (staff, for in-person operations), or anyone (admin).
const getUser = asyncHandler(async (req, res) => {
  if (!canViewClientProfile(req.user, req.params.id)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const user = await userService.getById(req.params.id);
  // Staff profile access is scoped to clients only - never other staff,
  // clinicians or administrators (their own record passes the self check).
  if (req.user.role === "staff" && req.user.id !== req.params.id && user.role !== "client") {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(user);
});

// PATCH /api/users/:id/emergency - self, staff assisting a client in person,
// or admin. Staff targets are re-checked in the service (clients only).
const updateEmergencyContact = asyncHandler(async (req, res) => {
  const allowed = req.user.id === req.params.id
    || req.user.role === "administrator"
    || req.user.role === "staff";
  if (!allowed) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { ok, fields, values } = validate(req.body, {
    name:         { type: "string", required: true, max: nameMax, label: "Contact name" },
    phone:        { type: "sgPhone", required: true, label: "Contact phone" },
    relationship: { type: "string", required: true, max: 60, label: "Relationship" },
  });
  if (!ok) return validationFailed(res, fields);

  const user = await userService.updateEmergencyContact(req.user, req.params.id, values);
  res.json(user);
});

// PATCH /api/users/:id/nric
const updateNric = asyncHandler(async (req, res) => {
  if (req.user.role !== "administrator" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { ok, fields, values } = validate(req.body, {
    nric: { type: "nric", required: true },
  });
  if (!ok) return validationFailed(res, fields);

  const user = await userService.updateNric(req.user, req.params.id, values.nric);
  res.json(user);
});

// PATCH /api/users/me/password - always self-service; the target account is
// taken from the token, never the body. The current password is re-verified
// so a hijacked session alone can't lock the owner out.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const fields = {};
  if (typeof currentPassword !== "string" || currentPassword === "" || currentPassword.length > 1024) {
    fields.currentPassword = "Current password is required";
  }
  if (typeof newPassword !== "string" || newPassword === "") {
    fields.newPassword = "New password is required";
  } else if (!strongPassword(newPassword)) {
    fields.newPassword = "Password must be 8 to 72 characters and include letters and numbers";
  }
  if (typeof confirmNewPassword !== "string" || confirmNewPassword === "") {
    fields.confirmNewPassword = "Please confirm your new password";
  } else if (typeof newPassword === "string" && confirmNewPassword !== newPassword) {
    fields.confirmNewPassword = "New password and confirmation do not match";
  }
  if (Object.keys(fields).length) return validationFailed(res, fields);

  const { user, token } = await userService.changePassword(req.user, currentPassword, newPassword);
  res.json({ user, token });
});

// PATCH /api/users/:id/profile - self, staff assisting a client in person, or
// admin. Staff targets are re-checked in the service (clients only). Identity
// fields (email, NRIC) have their own flows; this covers the profile basics.
const updateProfile = asyncHandler(async (req, res) => {
  const allowed = req.user.id === req.params.id
    || req.user.role === "administrator"
    || req.user.role === "staff";
  if (!allowed) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { ok, fields, values } = validate(req.body, {
    name:        { type: "string", max: nameMax, label: "Name" },
    dateOfBirth: { type: "birthDate", label: "Date of birth" },
    gender:      { type: "enum", values: ["male", "female", "other"], label: "Gender" },
    height:      { type: "number", ...heightLimits, label: "Height" },
    weight:      { type: "number", ...weightLimits, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);
  if (Object.keys(values).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update" });
  }

  const user = await userService.updateProfile(req.user, req.params.id, values);
  res.json(user);
});

// GET /api/users/:clientId/measurements
const listMeasurements = asyncHandler(async (req, res) => {
  const measurements = await userService.listMeasurements(req.params.clientId);
  res.json(measurements);
});

// POST /api/users/:clientId/measurements
const addMeasurement = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    height: { type: "number", required: true, ...heightLimits, label: "Height" },
    weight: { type: "number", required: true, ...weightLimits, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);

  const measurement = await userService.addMeasurement(req.params.clientId, values);
  res.status(201).json(measurement);
});

module.exports = {
  register,
  login,
  getMe,
  getUser,
  changePassword,
  updateProfile,
  updateEmergencyContact,
  updateNric,
  listMeasurements,
  addMeasurement,
};
