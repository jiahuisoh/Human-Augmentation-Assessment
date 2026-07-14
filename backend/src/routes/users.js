const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const erl = require("express-rate-limit");
const User = require("../models/User");
const { Measurement } = require("../models/Misc");
const { signToken } = require("../utils/jwt");
const verifyJWT = require("../middleware/verifyJWT");
const { canAccessClient, requireClientAccess } = require("../middleware/access");
const writeAudit = require("../middleware/auditLogger");
const asyncHandler = require("../utils/asyncHandler");
const { validEmail, validate, validationFailed } = require("../utils/validators");

const rateLimit = erl.rateLimit || erl;
const ipKeyGenerator = erl.ipKeyGenerator || ((ip) => ip);

// Login throttle keyed by IP + submitted email, counting failures only, so
// credential guessing is cut off without a shared-IP site-wide lockout.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `${ipKeyGenerator(req.ip)}|${email}`;
  },
  handler: (req, res) => res.status(429).json({ error: "Too many login attempts, please try again later." }),
});

// Registration throttle: the duplicate-email response is unavoidably an
// account-existence oracle (no email-verification flow exists to hide it), so
// cap how fast that oracle can be queried. 30/hour still covers a clinic
// kiosk onboarding a full day of clients.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (req, res) => res.status(429).json({ error: "Too many registration attempts, please try again later." }),
});

// Compared against when the email doesn't exist, so both failure paths cost
// one bcrypt verification and response timing can't confirm an account.
const DUMMY_HASH = bcrypt.hashSync("hana-invalid-password-placeholder", 12);

// ── Public routes ─────────────────────────────────────────────────────────────

// POST /api/users — register new client. The full NRIC is required and kept
// only as a bcrypt hash; staff sight the physical card at the clinic and the
// admin gives final approval before the account is verified.
router.post("/", registerLimiter, asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    email:       { type: "email", required: true },
    password:    { type: "password", required: true },
    name:        { type: "string", required: true, max: 120, label: "Name" },
    dateOfBirth: { type: "date", required: true, label: "Date of birth" },
    gender:      { type: "enum", required: true, values: ["male", "female", "other"], label: "Gender" },
    nric:        { type: "nric", required: true },
    height:      { type: "number", min: 100, max: 250, label: "Height" },
    weight:      { type: "number", min: 20, max: 300, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);
  const { email, password, name, dateOfBirth, gender, height, weight, nric } = values;

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(409).json({
      error: "This email cannot be used for registration. Please use a different address, or log in if you already have an account.",
    });
  }

  const user = await User.create({
    email, password, name, dateOfBirth, gender, height, weight,
    role: "client",
    nricHash: await bcrypt.hash(nric, 12),
    nricLastFour: nric.slice(-4),
  });
  const token = signToken(user);
  res.status(201).json({ user, token });
}));

// POST /api/users/login
router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const { password } = req.body;
  if (!validEmail(email) || typeof password !== "string" || password === "" || password.length > 1024) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await User.findOne({ email }).select("+password +passwordChangedAt");
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // equalise timing with the found-user path
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!(await user.comparePassword(password))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.verificationStatus === "suspended") {
    await writeAudit({ user: { id: user._id, role: user.role } }, "AUTH", `Suspended account login blocked: ${email}`, { userId: user._id }, "WARN");
    return res.status(403).json({ error: "Your account has been suspended. Please contact staff or administrator if you believe this is an error." });
  }
  const token = signToken(user);
  await writeAudit({ user: { id: user._id, role: user.role } }, "AUTH", `User logged in: ${email}`, { userId: user._id });
  res.json({ user, token });
}));

// ── Authenticated routes ──────────────────────────────────────────────────────

// GET /api/users/me
router.get("/me", verifyJWT, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));

// GET /api/users/:id — self, an assigned client (clinician), or anyone (admin)
router.get("/:id", verifyJWT, asyncHandler(async (req, res) => {
  if (!canAccessClient(req.user, req.params.id)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));

// PATCH /api/users/:id/emergency
router.patch("/:id/emergency", verifyJWT, asyncHandler(async (req, res) => {
  if (req.user.role !== "administrator" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { ok, fields, values } = validate(req.body, {
    name:         { type: "string", required: true, max: 120, label: "Contact name" },
    phone:        { type: "string", required: true, pattern: /^[0-9+\-\s()]{3,32}$/, label: "Contact phone", message: "A valid contact phone is required" },
    relationship: { type: "string", required: true, max: 60, label: "Relationship" },
  });
  if (!ok) return validationFailed(res, fields);

  // Only the three validated keys — never the raw body — reach the document.
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { emergencyContact: values },
    { new: true, runValidators: true },
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));

// PATCH /api/users/:id/nric — client updates their own NRIC (or admin on their
// behalf). Identity data changed, so any previous verification is void: the
// account returns to "unverified" and the staff flag is cleared, restarting
// the clinic verification workflow.
router.patch("/:id/nric", verifyJWT, asyncHandler(async (req, res) => {
  if (req.user.role !== "administrator" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { ok, fields, values } = validate(req.body, {
    nric: { type: "nric", required: true },
  });
  if (!ok) return validationFailed(res, fields);
  const { nric } = values;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        nricHash: await bcrypt.hash(nric, 12),
        nricLastFour: nric.slice(-4),
        verificationStatus: "unverified",
      },
      $unset: { staffVerification: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  // No longer verified, so any clinician assignment is removed as well; it can
  // only be re-established after staff-then-admin re-verification.
  await User.updateMany(
    { assignedClientIds: req.params.id },
    { $pull: { assignedClientIds: req.params.id } },
  );
  await writeAudit(req, "ADMIN", "NRIC updated; verification reset to unverified", { targetId: req.params.id }, "WARN");
  res.json(user);
}));

// ── Measurements ──────────────────────────────────────────────────────────────

// GET /api/users/:clientId/measurements
router.get("/:clientId/measurements", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const measurements = await Measurement.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
  res.json(measurements);
}));

// POST /api/users/:clientId/measurements
router.post("/:clientId/measurements", verifyJWT, requireClientAccess("clientId"), asyncHandler(async (req, res) => {
  const { ok, fields, values } = validate(req.body, {
    height: { type: "number", required: true, min: 100, max: 250, label: "Height" },
    weight: { type: "number", required: true, min: 20, max: 300, label: "Weight" },
  });
  if (!ok) return validationFailed(res, fields);
  const { height, weight } = values;

  const bmi = parseFloat((weight / ((height / 100) ** 2)).toFixed(1));
  const m = await Measurement.create({ clientId: req.params.clientId, height, weight, bmi });

  // Sync latest measurements back to the user document
  await User.findByIdAndUpdate(req.params.clientId, { height, weight });

  res.status(201).json(m);
}));

module.exports = router;
