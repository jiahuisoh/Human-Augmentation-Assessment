// Domain vocabularies, single-sourced. Models (schema enums) and routes
// (validation allowlists) must both import from here so the two layers can
// never drift apart. Keep this module dependency-free: it is required by
// model files and must not require anything that requires a model back.
// Frontend counterpart: frontend/src/utils/constants.ts.

const ROLES = ["client", "staff", "clinician", "developer", "administrator"];

const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "suspended"];

const TEST_IDS = ["chair_stand", "back_scratch", "sit_reach"];

const RISK_LEVELS = ["low", "moderate", "high"];

const CONSENT_SCOPES = ["research", "clinician_share", "third_party", "institutional", "assessment_data"];

module.exports = { ROLES, VERIFICATION_STATUSES, TEST_IDS, RISK_LEVELS, CONSENT_SCOPES };
