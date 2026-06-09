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
  emergencyContact?: EmergencyContact;
  programmeIds?: string[];
  assignedClientIds?: string[];
  createdAt: string;
}

export interface NewUserPayload {
  email: string;
  password: string;
  name: string;
  dateOfBirth: string;
  gender: Sex;
  height: number;
  weight: number;
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
  reps?: number;
  measurement?: number;
  classification?: string;
  riskLevel?: RiskLevel;
  interpretation?: string;
  normLow?: number;
  normHigh?: number;
  terminatedEarly?: boolean;
  livenessScore?: number;
  recordHash?: string; 
  overrides?: AssessmentOverride[];
  createdAt: string;
}

export interface AssessmentOverride {
  by: string;       
  byRole: Role;
  reason: string;
  originalScore: number;
  newScore: number;
  at: string;
}

export type SubmissionStatus = "pending" | "in_review" | "approved" | "rejected";

export interface VideoSubmission {
  _id: string;
  clientId: string;
  testId: TestId;
  fileName: string;
  fileSize: number;          
  fileMimeType: string;
  storageRef?: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
  resultingSessionId?: string;
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


export type ConsentScope = "research" | "clinician_share" | "third_party" | "institutional";

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

export interface AIRecommendation {
  _id: string;
  clientId: string;
  title: string;
  detail: string;
  confidence: number;  
  basis: string;
  status: "pending" | "approved" | "overridden";
  reviewedBy?: string;
  overrideReason?: string;
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
