const asyncHandler = require("../utils/asyncHandler");
const { validate, validationFailed } = require("../utils/validators");
const { ROLES, VERIFICATION_STATUSES } = require("../utils/constants");
const adminService = require("../services/adminService");

// GET /api/admin/users
const listUsers = asyncHandler(async (req, res) => {
  const users = await adminService.listUsers();
  res.json(users);
});

// POST /api/admin/users
const createUser = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    email:       { type: "email", required: true },
    password:    { type: "password", required: true },
    name:        { type: "string", required: true, max: 120, label: "Name" },
    role:        { type: "enum", required: true, values: ROLES, label: "Role" },
    dateOfBirth: { type: "birthDate", label: "Date of birth" },
    gender:      { type: "enum", values: ["male", "female", "other"], label: "Gender" },
    nric:        { type: "nric" },
    height:      { type: "number", min: 100, max: 200, label: "Height" },
    weight:      { type: "number", min: 20, max: 200, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);

  const user = await adminService.createUser(req.user, values);
  res.status(201).json(user);
});

// PATCH /api/admin/users/:id/status
const setUserStatus = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    verificationStatus: { type: "enum", required: true, values: VERIFICATION_STATUSES, label: "verificationStatus" },
  });
  if (!ok) return validationFailed(res, fields);

  const user = await adminService.setUserStatus(req.user, req.params.id, values.verificationStatus);
  res.json(user);
});

// PATCH /api/admin/users/:clinicianId/assign-client
const assignClient = asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    clientId: { type: "objectId", required: true, label: "clientId" },
    assign:   { type: "boolean", required: true, label: "assign" },
  });
  if (!ok) return validationFailed(res, fields);

  const clinician = await adminService.setClientAssignment(
    req.user, req.params.clinicianId, values.clientId, values.assign,
  );
  res.json(clinician);
});

// DELETE /api/admin/users/:id
const deleteUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.user, req.params.id);
  res.json({ message: "User deleted" });
});

module.exports = { listUsers, createUser, setUserStatus, assignClient, deleteUser };
