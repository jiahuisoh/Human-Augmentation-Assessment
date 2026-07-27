const AIRecommendation = require("../models/AIRecommendation");
const Consent = require("../models/Consent");
const InterventionPlan = require("../models/InterventionPlan");
const Measurement = require("../models/Measurement");
const QuestionnaireSubmission = require("../models/QuestionnaireSubmission");
const ScheduleEntry = require("../models/ScheduleEntry");
const Session = require("../models/Session");

/**
 * Every collection a client is the SUBJECT of, keyed by clientId.
 *
 * Keyed by subject and never by actor: `conductedBy`, `authoredBy`, `recordedBy`
 * and `assignedTo` name whoever performed the action, so a clinician leaving
 * must not take their patients' assessments with them.
 *
 * Audit logs are deliberately absent. They are the record that the deletion
 * happened - erasing them would destroy the accountability trail rather than
 * protect anyone.
 *
 * Anything added later that stores data about a client belongs in this list;
 * it is the single place that decides what "delete my data" means.
 */
const CLIENT_OWNED_MODELS = [
  AIRecommendation,
  Consent,
  InterventionPlan,
  Measurement,
  QuestionnaireSubmission,
  ScheduleEntry,
  Session,
];

/**
 * Remove everything held about one client.
 */
const purgeClientData = async (clientId) => {
  const removed = await Promise.all(
    CLIENT_OWNED_MODELS.map(async (Model) => [
      Model.modelName,
      (await Model.deleteMany({ clientId })).deletedCount,
    ]),
  );
  return Object.fromEntries(removed.filter(([, count]) => count > 0));
};

module.exports = { CLIENT_OWNED_MODELS, purgeClientData };
