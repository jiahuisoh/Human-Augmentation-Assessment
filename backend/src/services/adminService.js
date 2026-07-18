const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const httpError = require("../utils/httpError");
const { writeAudit } = require("./auditService");

// ── Last-administrator invariant ──────────────────────────────────────────────
// "Suspended" is the only status that blocks auth (login and verifyJWT), so
// suspending an administrator locks them out as surely as deleting them. The
// invariant — at least one non-suspended administrator always remains — spans
// multiple documents, so a pre-write count alone is racy: two admins acting on
// each other concurrently both pass their own check (write-skew) and lock
// everyone out. Lockout-capable mutations are therefore serialized through
// this in-process queue; the backend runs as a single Node process, which
// makes the queue a real mutex. (If the app is ever clustered, this must move
// to a DB-level serialization point.)
let adminMutationChain = Promise.resolve();
const withAdminLock = (task) => {
  const run = adminMutationChain.then(task);
  adminMutationChain = run.then(() => {}, () => {});
  return run;
};

const hasOtherActiveAdmin = async (excludedId) =>
  (await User.exists({
    role: "administrator",
    // sanitizeFilter (config/db.js) rejects bare $-operators in filters; mark
    // these code-authored conditions as trusted - same as staff_service.
    verificationStatus: mongoose.trusted({ $ne: "suspended" }),
    _id: mongoose.trusted({ $ne: excludedId }),
  })) !== null;

const listUsers = () => User.find().sort({ createdAt: -1 });

const createUser = async (actor, values) => {
  const { email, password, name, role, dateOfBirth, gender, height, weight, nric } = values;

  const exists = await User.findOne({ email });
  if (exists) throw httpError(409, "Email already registered");

  const user = await User.create({
    email, password, name, role, dateOfBirth, gender, height, weight,
    nricHash: nric ? await bcrypt.hash(nric, 12) : undefined,
    nricLastFour: nric ? nric.slice(-4) : undefined,
  });
  await writeAudit(actor, "ADMIN", `Admin created user: ${email} (${role})`, { targetId: user._id });
  return user;
};

const setUserStatus = async (actor, targetId, verificationStatus) => {
  const user = await withAdminLock(async () => {
    // Suspending is lockout-capable, so it must respect the last-admin
    // invariant; other status transitions don't block auth.
    if (verificationStatus === "suspended") {
      const target = await User.findById(targetId).select("role").lean();
      if (!target) throw httpError(404, "User not found");
      if (target.role === "administrator" && !(await hasOtherActiveAdmin(targetId))) {
        throw httpError(409, "Cannot suspend the last active administrator.");
      }
    }
    const updated = await User.findByIdAndUpdate(targetId, { verificationStatus }, { new: true, runValidators: true });
    if (!updated) throw httpError(404, "User not found");
    return updated;
  });
  // Assignment requires a verified identity, so losing "verified" (unverified,
  // pending or suspended) also removes the client from every clinician's list.
  // Re-assignment happens only after the full staff-then-admin re-verification.
  if (verificationStatus !== "verified") {
    await User.updateMany(
      { assignedClientIds: targetId },
      { $pull: { assignedClientIds: targetId } },
    );
  }
  await writeAudit(actor, "ADMIN", `User status updated to ${verificationStatus}`, { targetId });
  return user;
};

const setClientAssignment = async (actor, clinicianId, clientId, assign) => {
  if (assign) {
    const client = await User.findById(clientId);
    if (!client) throw httpError(404, "Client not found");
    if (client.verificationStatus === "suspended") {
      throw httpError(409, "Cannot assign a suspended client to a clinician.");
    }
    if (client.verificationStatus !== "verified") {
      throw httpError(409, "Only verified clients can be assigned to a clinician.");
    }
  }
  const update = assign
    ? { $addToSet: { assignedClientIds: clientId } }
    : { $pull: { assignedClientIds: clientId } };

  const clinician = await User.findByIdAndUpdate(clinicianId, update, { new: true });
  if (!clinician) throw httpError(404, "Clinician not found");

  await writeAudit(actor, "ADMIN", `Client ${assign ? "assigned to" : "removed from"} clinician`, {
    clinicianId, clientId,
  });
  return clinician;
};

const deleteUser = async (actor, targetId) => {
  // Existence check, last-admin check and the delete form one critical
  // section: check-then-write must be atomic, or two concurrent deletes could
  // remove both remaining administrators.
  await withAdminLock(async () => {
    const target = await User.findById(targetId).select("role").lean();
    if (!target) throw httpError(404, "User not found");
    if (target.role === "administrator" && !(await hasOtherActiveAdmin(targetId))) {
      throw httpError(409, "Cannot delete the last active administrator.");
    }
    await User.findByIdAndDelete(targetId);
  });
  await User.updateMany(
    { assignedClientIds: targetId },
    { $pull: { assignedClientIds: targetId } },
  );
  await writeAudit(actor, "ADMIN", `User deleted`, { targetId }, "WARN");
};

module.exports = { listUsers, createUser, setUserStatus, setClientAssignment, deleteUser };
