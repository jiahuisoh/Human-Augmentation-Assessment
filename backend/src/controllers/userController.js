const asyncHandler = require("../utils/asyncHandler");
const { validEmail, validate, validationFailed } = require("../utils/validators");
const { canAccessClient } = require("../middleware/access");
const userService = require("../services/userService");

// POST /api/users
const register = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    email:       { type: "email", required: true },
    password:    { type: "password", required: true },
    name:        { type: "string", required: true, max: 120, label: "Name" },
    dateOfBirth: { type: "birthDate", required: true, label: "Date of birth" },
    gender:      { type: "enum", required: true, values: ["male", "female", "other"], label: "Gender" },
    nric:        { type: "nric", required: true },
    height:      { type: "number", min: 100, max: 200, label: "Height" },
    weight:      { type: "number", min: 20, max: 200, label: "Weight" },
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

// GET /api/users/:id — self, an assigned client (clinician), or anyone (admin)
const getUser = asyncHandler(async (req, res) => {
  if (!canAccessClient(req.user, req.params.id)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const user = await userService.getById(req.params.id);
  res.json(user);
});

// PATCH /api/users/:id/emergency
const updateEmergencyContact = asyncHandler(async (req, res) => {
  if (req.user.role !== "administrator" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { ok, fields, values } = validate(req.body, {
    name:         { type: "string", required: true, max: 120, label: "Contact name" },
    phone:        { type: "string", required: true, pattern: /^[0-9+\-\s()]{3,32}$/, label: "Contact phone", message: "A valid contact phone is required" },
    relationship: { type: "string", required: true, max: 60, label: "Relationship" },
  });
  if (!ok) return validationFailed(res, fields);

  const user = await userService.updateEmergencyContact(req.params.id, values);
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

// GET /api/users/:clientId/measurements
const listMeasurements = asyncHandler(async (req, res) => {
  const measurements = await userService.listMeasurements(req.params.clientId);
  res.json(measurements);
});

// POST /api/users/:clientId/measurements
const addMeasurement = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    height: { type: "number", required: true, min: 100, max: 200, label: "Height" },
    weight: { type: "number", required: true, min: 20, max: 200, label: "Weight" },
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
  updateEmergencyContact,
  updateNric,
  listMeasurements,
  addMeasurement,
};
