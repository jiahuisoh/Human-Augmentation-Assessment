const mongoose = require("mongoose");
const ScheduleEntry = require("../models/ScheduleEntry");
const User = require("../models/User");
const httpError = require("../utils/httpError");
const { canAccessClient } = require("../middleware/access");
const { clinicHours } = require("../utils/constants");
const { clinicToday, clinicNow } = require("../utils/clinicDate");
const { writeAudit } = require("./auditService");

/**
 * Attach each client's CURRENT verification status to a set of entries.
 *
 * A join rather than a stored field: verification moves after a booking is made
 * - an administrator approves it, or suspends the account - and a copy taken at
 * creation would quietly disagree with the account it describes. One extra
 * query covers the whole list; there is no per-row lookup.
 */
const withLiveVerification = async (entries) => {
  if (entries.length === 0) return [];
  const ids = [...new Set(entries.map(e => e.clientId))];
  // mongoose.trusted(): sanitizeFilter would otherwise wrap this code-authored
  // $in in $eq. These ids come from our own documents, never from the request.
  const users = await User.find({ _id: mongoose.trusted({ $in: ids }) })
    .select("verificationStatus")
    .lean();
  const verified = new Map(users.map(u => [u._id.toString(), u.verificationStatus === "verified"]));

  return entries.map(e => ({
    ...e,
    _id: e._id.toString(),
    nricVerified: verified.get(e.clientId) === true,
  }));
};

// Today's list for the front desk, in the order the day actually runs.
const listToday = async () => {
  const entries = await ScheduleEntry.find({ date: clinicToday() }).sort({ time: 1 }).lean();
  return withLiveVerification(entries);
};

// What is booked for one patient from today onwards. Past appointments are
// history and belong to the assessment record, not to a booking list.
const listUpcomingForClient = async (clientId) => {
  const entries = await ScheduleEntry
    .find({ clientId, date: mongoose.trusted({ $gte: clinicToday() }) })
    .sort({ date: 1, time: 1 })
    .lean();
  return withLiveVerification(entries);
};

const create = async (actor, { clientId, testId, date, time }) => {
  // Safe as string comparisons: YYYY-MM-DD and HH:MM are both fixed-width and
  // zero-padded, so lexicographic order is chronological order.
  if (time < clinicHours.opens || time > clinicHours.closes) {
    throw httpError(400, `Opening hours for clinic run between ${clinicHours.opens} and ${clinicHours.closes}.`);
  }
  const now = clinicNow();
  if (date < now.date) {
    throw httpError(400, "An assessment cannot be scheduled in the past.");
  }
  // Strictly-past minutes only. The current minute stays bookable, which keeps
  // this in step with the form: the time field's `min` is inclusive, so a
  // clinician picking the earliest offered slot must not be rejected for it.
  if (date === now.date && time < now.time) {
    throw httpError(400, `That time has already passed today (it is now ${now.time}). Choose a later time, or another day.`);
  }
  if (!canAccessClient(actor, clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }

  const client = await User.findById(clientId).select("name role").lean();
  if (!client) throw httpError(404, "Client not found");
  if (client.role !== "client") {
    throw httpError(400, "Assessments can only be scheduled for client accounts.");
  }

  let entry;
  try {
    entry = await ScheduleEntry.create({
      clientId,
      clientName: client.name,
      testId,
      date,
      time,
      status: "scheduled",
    });
  } catch (err) {
    // The unique indexes are the real guard against a double booking; translate
    // them into something the clinician can act on rather than a 500. Which key
    // failed says which rule was broken, and the two need different advice.
    if (err?.code === 11000) {
      throw err.keyPattern?.time !== undefined
        ? httpError(409, "This client is already booked for another assessment at that time. Choose a different slot.")
        : httpError(409, "This client already has that assessment scheduled for that day.");
    }
    throw err;
  }

  await writeAudit(actor, "ASSESSMENT", `Assessment scheduled: ${testId}`, { clientId, date, time });
  const [created] = await withLiveVerification([entry.toObject()]);
  return created;
};

const setAttendance = async (actor, entryId, present) => {
  const entry = await ScheduleEntry.findByIdAndUpdate(
    entryId,
    { status: present ? "present" : "absent" },
    { new: true, runValidators: true },
  ).lean();
  if (!entry) throw httpError(404, "Schedule entry not found");

  await writeAudit(actor, "ASSESSMENT", `Attendance recorded: ${present ? "present" : "absent"}`, {
    entryId: entry._id.toString(), clientId: entry.clientId,
  });
  const [updated] = await withLiveVerification([entry]);
  return updated;
};

const cancel = async (actor, entryId) => {
  const entry = await ScheduleEntry.findById(entryId).lean();
  if (!entry) throw httpError(404, "Schedule entry not found");
  if (!canAccessClient(actor, entry.clientId)) {
    throw httpError(403, "You do not have access to this client's data.");
  }
  // Attendance having been marked means the visit happened; deleting the row
  // would erase that from the day's record.
  if (entry.status !== "scheduled") {
    throw httpError(409, "This session has already been marked, so it can no longer be cancelled.");
  }

  await ScheduleEntry.deleteOne({ _id: entry._id });
  await writeAudit(actor, "ASSESSMENT", `Assessment booking cancelled: ${entry.testId}`, {
    clientId: entry.clientId, date: entry.date, time: entry.time,
  });
};

module.exports = { listToday, listUpcomingForClient, create, setAttendance, cancel };
