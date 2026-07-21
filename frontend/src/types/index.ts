export type Role = "client" | "staff" | "clinician" | "developer" | "administrator";


export type Sex       = "male" | "female" | "other";
export type TestId    = "chair_stand" | "back_scratch" | "sit_reach";
export type RiskLevel = "low" | "moderate" | "high";

export type VerificationStatus = "unverified" | "pending" | "verified" | "suspended";

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}



/** Outcome of the in-person staff NRIC check, awaiting admin approval. */
export interface StaffVerification {
  recommended: boolean;
  by: string;
  at: string;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  role: Role;
  dateOfBirth?: string;
  gender?: Sex;
  height?: number;
  weight?: number;
  verificationStatus: VerificationStatus;
  staffVerification?: StaffVerification;
  /** Last 4 characters of the NRIC, for masked display (e.g. •••••567D). */
  nricLastFour?: string;
  emergencyContact?: EmergencyContact;
  programmeIds?: string[];
  assignedClientIds?: string[];
  createdAt: string;
}

export interface NewUserPayload {
  email: string;
  password: string;
  name: string;
  dateOfBirth?: string;
  gender?: Sex;
  height?: number;
  weight?: number;
  /** Full Singapore NRIC/FIN. Stored server-side as a bcrypt hash only. */
  nric?: string;
}

export interface Measurement {
  _id: string;
  clientId: string;
  height: number;
  weight: number;
  bmi: number;
  createdAt: string;
}

export interface AssessmentSession {
  _id: string;
  clientId: string;
  conductedBy: string;
  testId: TestId;
  // Raw measurements, as reported by the device that ran the test.
  reps?: number;
  measurement?: number;
  timeTo5StandsS?: number;
  // Derived by the server from the client's stored profile. Read-only here:
  // anything sent for these on save is discarded by the API.
  classification?: string;
  riskLevel?: RiskLevel;
  interpretation?: string;
  normLow?: number;
  normHigh?: number;
  sppbStsPoints?: number;
  awgs19SlowSts?: boolean;
  normApplicability?: "in_range" | "extrapolated" | "out_of_range";
  trafficLight?: "red" | "amber" | "green";
  calibrationQuality?: number;
  needsQualityReview?: boolean;
  kneeBent?: boolean;
  ageAtTest?: number;
  sexAtTest?: Sex;
  heightAtTestCm?: number;
  terminatedEarly?: boolean;
  livenessScore?: number;
  recordHash?: string;
  overrides?: AssessmentOverride[];
  createdAt: string;
}

/**
 * What a client is allowed to submit. The clinical verdict (classification,
 * risk level, interpretation, norm band, SPPB points) is computed server-side
 * and is deliberately absent - see backend/src/utils/norms.js.
 */
export interface NewSessionPayload {
  /** Opaque, signed by the CV service. The browser forwards it unread. */
  cvOutcomeToken: string;
}

/** Short-lived authorisation to run one assessment on the CV service. */
export interface CvGrant {
  token: string;
  expiresInSeconds: number;
}

export interface AssessmentOverride {
  by: string;       
  byRole: Role;
  reason: string;
  originalScore: number;
  newScore: number;
  at: string;
}

export type QuestionnaireQuestionKind = "scale_1_5" | "yes_no" | "minutes";

export interface QuestionnaireQuestion {
  id: string;
  prompt: string;
  kind: QuestionnaireQuestionKind;
}

export type QuestionnaireAnswer = number | boolean;

export interface QuestionnaireSubmission {
  _id: string;
  clientId: string;
  answers: Record<string, QuestionnaireAnswer>;
  submittedAt: string;
}


export type ConsentScope = "research" | "clinician_share" | "third_party" | "institutional" | "assessment_data";

export interface ConsentEvent {
  _id: string;
  clientId: string;
  scope: ConsentScope;
  granted: boolean;
  reason?: string;
  txHash?: string;
  createdAt: string;
}


export type AuditCategory = "AUTH" | "TOKEN" | "ADMIN" | "CONTRACT" | "CONSENT" | "AI" | "CV" | "ASSESSMENT";
export type AuditLevel = "INFO" | "WARN" | "ERROR";

export interface AuditLog {
  _id: string;
  actorId: string;
  actorRole: Role;
  category: AuditCategory;
  level: AuditLevel;
  message: string;
  context?: Record<string, unknown>;
  createdAt: string;
}


export interface InterventionPlanItem {
  activity: string;
  frequency: string;
  duration?: string;
  done?: boolean;
}

export interface InterventionPlan {
  _id: string;
  clientId: string;
  authoredBy: string;        
  items: InterventionPlanItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A client awaiting the in-person NRIC check, as seen by staff.
 * Intentionally minimal - staff are not entitled to client PII.
 */
export interface PendingVerificationClient {
  _id: string;
  name: string;
  verificationStatus: VerificationStatus;
  /** true once staff have run the check and it is with the admin. */
  checked: boolean;
  /** Outcome of the staff check: true = matched, false = did not match, null = not yet checked. */
  recommended: boolean | null;
  createdAt: string;
}

export type AttendanceStatus = "scheduled" | "present" | "absent" | "in_progress" | "completed" | "pending_nric";

export interface ScheduleEntry {
  _id: string;
  clientId: string;
  clientName: string;
  testId: TestId;
  time: string;
  status: AttendanceStatus;
  nricVerified: boolean;
}


export interface AuthResponse {
  user: User;
  token: string;
}


export interface ProfileUpdate {
  name?: string;
  dateOfBirth?: string;
  gender?: Sex;
  height?: number;
  weight?: number;
}
