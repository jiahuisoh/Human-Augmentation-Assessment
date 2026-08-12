const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Measurement = require("../models/Measurement");
const { signToken } = require("../utils/jwt");
const httpError = require("../utils/httpError");
const { isPasswordBreached } = require("../utils/hibp");
const { writeAudit } = require("./auditService");


// Kept word for word in step with frontend/src/utils/passwordStrength.ts, so
// the live banner and the refusal returned here read identically.
const BREACHED_PASSWORD_MESSAGE =
  "This password has appeared in a known data breach. Please choose a different password to use.";
const BREACHED_PASSWORD_CODE = "PASSWORD_BREACHED";

// Compared against when the email doesn't exist, so both failure paths cost
// one bcrypt verification and response timing can't confirm an account.
const DUMMY_HASH = bcrypt.hashSync("hana-invalid-password-placeholder", 12);

// Register new client. The full NRIC is required and kept only as a bcrypt
// hash; staff sight the physical card at the clinic and the admin gives final
// approval before the account is verified.
const register = async (values) => {
  const { email, password, name, dateOfBirth, gender, height, weight, nric } = values;

  const exists = await User.findOne({ email });
  if (exists) {
    throw httpError(409, "This email cannot be used for registration. Please use a different address, or log in if you already have an account.");
  }

  if (await isPasswordBreached(password)) {
    throw httpError(400, BREACHED_PASSWORD_MESSAGE, BREACHED_PASSWORD_CODE);
  }

  const user = await User.create({
    email, password, name, dateOfBirth, gender, height, weight,
    role: "client",
    nricHash: await bcrypt.hash(nric, 12),
    nricLastFour: nric.slice(-4),
  });
  // Admin-created accounts were audited but self-registration was not, so an
  // account could appear with nothing recording where it came from. No request
  // context exists yet, so the new user is its own actor - same shape login uses.
  await writeAudit({ id: user._id, role: user.role }, "AUTH", `Account registered: ${email}`, { userId: user._id });
  return { user, token: signToken(user) };
};

const login = async (email, password) => {
  const user = await User.findOne({ email }).select("+password +passwordChangedAt");
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // equalise timing with the found-user path
    // The caller still gets one indistinguishable 401; the distinction is
    // recorded only in the trail, where it separates a mistyped password from
    // someone walking a list of addresses.
    await writeAudit(null, "AUTH", `Failed login attempt: ${email}`, { reason: "unknown_email" }, "WARN");
    throw httpError(401, "Invalid email or password");
  }
  if (!(await user.comparePassword(password))) {
    await writeAudit({ id: user._id, role: user.role }, "AUTH", `Failed login attempt: ${email}`, { userId: user._id, reason: "bad_password" }, "WARN");
    throw httpError(401, "Invalid email or password");
  }
  if (user.verificationStatus === "suspended") {
    await writeAudit({ id: user._id, role: user.role }, "AUTH", `Suspended account login blocked: ${email}`, { userId: user._id }, "WARN");
    throw httpError(403, "Your account has been suspended. Please contact staff or administrator if you believe this is an error.");
  }
  const token = signToken(user);
  await writeAudit({ id: user._id, role: user.role }, "AUTH", `User logged in: ${email}`, { userId: user._id });
  return { user, token };
};

const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw httpError(404, "User not found");
  return user;
};


const changePassword = async (actor, currentPassword, newPassword) => {
  const user = await User.findById(actor.id).select("+password +passwordChangedAt");
  if (!user) throw httpError(404, "User not found");

  if (!(await user.comparePassword(currentPassword))) {
    await writeAudit(actor, "AUTH", "Password Change Rejected: Current Password Incorrect", { userId: actor.id }, "WARN");
    throw httpError(400, "Current Password is Incorrect");
  }
  if (newPassword === currentPassword) {
    throw httpError(400, "New password must be different from your current password");
  }
  if (await isPasswordBreached(newPassword)) {
    await writeAudit(actor, "AUTH", "Password change rejected: new password found in a breach corpus", { userId: actor.id }, "WARN");
    throw httpError(400, BREACHED_PASSWORD_MESSAGE, BREACHED_PASSWORD_CODE);
  }

  user.password = newPassword;
  await user.save();
  await writeAudit(actor, "AUTH", "Password changed; other sessions invalidated", { userId: actor.id });
  return { user, token: signToken(user) };
};


const updateProfile = async (actor, id, values) => {
  if (actor.role === "staff" && actor.id !== id) {
    const target = await User.findById(id).select("role");
    if (!target) throw httpError(404, "User not found");
    if (target.role !== "client") throw httpError(403, "Access denied");
  }
  const user = await User.findByIdAndUpdate(
    id,
    { $set: values },
    { new: true, runValidators: true },
  );
  if (!user) throw httpError(404, "User not found");
  await writeAudit(actor, "PROFILE",
    actor.id === id ? "Profile updated" : `Profile updated by ${actor.role}`,
    { clientId: id, fields: Object.keys(values) });
  return user;
};

const updateEmergencyContact = async (actor, id, contact) => {
  // Staff may edit on behalf of clients they assist in person — but only
  // client accounts, never staff/clinician/admin ones.
  if (actor.role === "staff" && actor.id !== id) {
    const target = await User.findById(id).select("role");
    if (!target) throw httpError(404, "User not found");
    if (target.role !== "client") throw httpError(403, "Access denied");
  }
  // Only the validated keys — never the raw body — reach the document.
  const user = await User.findByIdAndUpdate(
    id,
    { emergencyContact: contact },
    { new: true, runValidators: true },
  );
  if (!user) throw httpError(404, "User not found");
  await writeAudit(actor, "PROFILE",
    actor.id === id ? "Emergency contact updated" : `Emergency contact updated by ${actor.role}`,
    { clientId: id });
  return user;
};

// Client updates their own NRIC (or admin on their behalf). Identity data
// changed, so any previous verification is void: the account returns to
// "unverified" and the staff flag is cleared, restarting the clinic
// verification workflow.
const updateNric = async (actor, id, nric) => {
  // The NRIC verification workflow applies to client accounts only (staff can
  // only verify clients, and only clients are gated on verification). Without
  // this check the verification reset below would let an admin demote any
  // account's status — including their own or another administrator's —
  // bypassing the admin-lifecycle guards in admin.service.js.
  const target = await User.findById(id).select("role").lean();
  if (!target) throw httpError(404, "User not found");
  if (target.role !== "client") {
    throw httpError(403, "NRIC can only be updated on client accounts.");
  }

  const user = await User.findByIdAndUpdate(
    id,
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
  if (!user) throw httpError(404, "User not found");
  // No longer verified, so any clinician assignment is removed as well; it can
  // only be re-established after staff-then-admin re-verification.
  await User.updateMany(
    { assignedClientIds: id },
    { $pull: { assignedClientIds: id } },
  );
  await writeAudit(actor, "ADMIN", "NRIC updated; verification reset to unverified", { targetId: id }, "WARN");
  return user;
};

const listMeasurements = (clientId) =>
  Measurement.find({ clientId }).sort({ createdAt: -1 });

const addMeasurement = async (clientId, { height, weight }) => {
  const bmi = parseFloat((weight / ((height / 100) ** 2)).toFixed(1));
  const measurement = await Measurement.create({ clientId, height, weight, bmi });

  // Sync latest measurements back to the user document
  await User.findByIdAndUpdate(clientId, { height, weight });

  return measurement;
};

module.exports = {
  register,
  login,
  getById,
  changePassword,
  updateProfile,
  updateEmergencyContact,
  updateNric,
  listMeasurements,
  addMeasurement,
};
