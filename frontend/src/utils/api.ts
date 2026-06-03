import type {
  AIRecommendation, AssessmentSession, AuditLog, AuthResponse, ConsentEvent,
  EmergencyContact, InterventionPlan, Measurement, NewUserPayload,
  QuestionnaireSubmission, RedemptionCatalogueItem, Role, ScheduleEntry,
  SmartContract, TestId, TokenTransaction, User, VideoSubmission,
} from "../types";
import { getToken, setToken } from "./tokenStore";


const BASE_URL: string = import.meta.env.VITE_API_URL || "http://localhost:4502";

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
}

async function apiFetch<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("BACKEND_UNREACHABLE");
  }

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : {};

  if (!res.ok) {
    const errMsg = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return {}; }
}

// Interfaces

export interface IUserApi {
  register(payload: NewUserPayload): Promise<User>;
  login(email: string, password: string): Promise<User>;
  getCurrent(): Promise<User>;
  getById(id: string): Promise<User>;
  list(): Promise<User[]>;
  create(payload: NewUserPayload & { role: Role }): Promise<User>;
  setStatus(id: string, verificationStatus: User["verificationStatus"]): Promise<User>;
  delete(id: string): Promise<void>;
  saveEmergencyContact(id: string, contact: EmergencyContact): Promise<void>;
  verifyNric(id: string, nricLast4: string): Promise<User>;
  assignClient(clinicianId: string, clientId: string, assign: boolean): Promise<User>;
}

export interface ISessionApi {
  save(session: Omit<AssessmentSession, "_id" | "createdAt">): Promise<AssessmentSession>;
  listForClient(clientId: string): Promise<AssessmentSession[]>;
  override(id: string, byUserId: string, byRole: Role, reason: string, originalScore: number, newScore: number): Promise<AssessmentSession>;
}

export interface IScheduleApi {
  listToday(): Promise<ScheduleEntry[]>;
  recordAttendance(id: string, present: boolean): Promise<ScheduleEntry>;
}

export interface ITokenApi {
  balanceFor(clientId: string): Promise<number>;
  historyFor(clientId: string): Promise<TokenTransaction[]>;
  award(args: { clientId: string; amount: number; eventType: TokenTransaction["eventType"]; livenessScore?: number; sessionId?: string; reason?: string }): Promise<TokenTransaction>;
  issueManual(args: { clientId: string; amount: number; issuedBy: string; reason: string }): Promise<TokenTransaction>;
  approve(id: string, approverId: string): Promise<TokenTransaction>;
  reject(id: string, approverId: string, reason: string): Promise<TokenTransaction>;
  revoke(id: string, requestedBy: string, reason: string): Promise<TokenTransaction>;
  pendingApprovals(): Promise<TokenTransaction[]>;
  redemptionCatalogue(): Promise<RedemptionCatalogueItem[]>;
  redeem(clientId: string, itemId: string): Promise<TokenTransaction>;
}

export interface IConsentApi {
  historyFor(clientId: string): Promise<ConsentEvent[]>;
  set(clientId: string, scope: ConsentEvent["scope"], granted: boolean): Promise<ConsentEvent>;
}

export interface IAuditApi {
  list(limit?: number): Promise<AuditLog[]>;
  write(payload: Omit<AuditLog, "_id" | "createdAt">): Promise<AuditLog>;
}

export interface IAIApi {
  pendingFor(clinicianId: string): Promise<AIRecommendation[]>;
  forClient(clientId: string): Promise<AIRecommendation[]>;
  approve(id: string, byUserId: string): Promise<AIRecommendation>;
  override(id: string, byUserId: string, reason: string): Promise<AIRecommendation>;
}

export interface IPlanApi {
  forClient(clientId: string): Promise<InterventionPlan | null>;
  save(plan: Omit<InterventionPlan, "_id" | "createdAt" | "updatedAt">): Promise<InterventionPlan>;
}

export interface IContractApi {
  list(): Promise<SmartContract[]>;
  requestDeployment(id: string, requestedBy: string): Promise<SmartContract>;
  approveDeployment(id: string, approvedBy: string): Promise<SmartContract>;
}

export interface IMeasurementApi {
  save(clientId: string, height: number, weight: number): Promise<Measurement>;
  listForClient(clientId: string): Promise<Measurement[]>;
}


export interface ISubmissionApi {
  submitVideo(args: {
    clientId: string;
    testId: TestId;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
    file?: File;
  }): Promise<VideoSubmission>;
  getVideoUrl(submissionId: string): string | null;
  listForClient(clientId: string): Promise<VideoSubmission[]>;
  listPending(): Promise<VideoSubmission[]>;
  deleteOwn(id: string, clientId: string): Promise<void>;
  /** Clinician/admin approval: creates AssessmentSession + awards tokens. */
  approve(args: {
    id: string;
    reviewerId: string;
    reviewerRole: Role;
    reps?: number;
    measurement?: number;
    classification?: string;
    notes?: string;
  }): Promise<{ submission: VideoSubmission; session: AssessmentSession }>;
  reject(id: string, reviewerId: string, notes: string): Promise<VideoSubmission>;
}


export interface IQuestionnaireApi {
  submit(args: { clientId: string; answers: Record<string, number | boolean> }): Promise<QuestionnaireSubmission>;
  listForClient(clientId: string): Promise<QuestionnaireSubmission[]>;
}


class RestUserApi implements IUserApi {
  constructor(private base: string) {}
  async register(p: NewUserPayload): Promise<User> {
    const r = await apiFetch<AuthResponse>(`${this.base}/api/users`, { method: "POST", body: p });
    setToken(r.token);
    return r.user;
  }
  async login(email: string, password: string): Promise<User> {
    const r = await apiFetch<AuthResponse>(`${this.base}/api/users/login`, { method: "POST", body: { email, password } });
    setToken(r.token);
    return r.user;
  }
  getCurrent()  { return apiFetch<User>(`${this.base}/api/users/me`); }
  getById(id: string)   { return apiFetch<User>(`${this.base}/api/users/${id}`); }
  list()        { return apiFetch<User[]>(`${this.base}/api/admin/users`); }
  create(p: NewUserPayload & { role: Role }) { return apiFetch<User>(`${this.base}/api/admin/users`, { method: "POST", body: p }); }
  setStatus(id: string, verificationStatus: User["verificationStatus"]) {
    return apiFetch<User>(`${this.base}/api/admin/users/${id}/status`, { method: "PATCH", body: { verificationStatus } });
  }
  async delete(id: string) { await apiFetch<void>(`${this.base}/api/admin/users/${id}`, { method: "DELETE" }); }
  assignClient(clinicianId: string, clientId: string, assign: boolean) {
    return apiFetch<User>(`${this.base}/api/admin/users/${clinicianId}/assign-client`, { method: "PATCH", body: { clientId, assign } });
  }
  async saveEmergencyContact(id: string, contact: EmergencyContact) {
    await apiFetch<void>(`${this.base}/api/users/${id}/emergency`, { method: "PATCH", body: contact });
  }
  verifyNric(id: string, nricLast4: string) {
    return apiFetch<User>(`${this.base}/api/staff/users/${id}/verify-nric`, { method: "POST", body: { nricLast4 } });
  }
}

class RestSessionApi implements ISessionApi {
  constructor(private base: string) {}
  save(s: Omit<AssessmentSession, "_id" | "createdAt">) {
    return apiFetch<AssessmentSession>(`${this.base}/api/sessions`, { method: "POST", body: s });
  }
  listForClient(clientId: string) {
    return apiFetch<AssessmentSession[]>(`${this.base}/api/sessions/client/${clientId}`);
  }
  override(id: string, byUserId: string, byRole: Role, reason: string, originalScore: number, newScore: number) {
    return apiFetch<AssessmentSession>(`${this.base}/api/sessions/${id}/override`, {
      method: "PATCH",
      body: { byUserId, byRole, reason, originalScore, newScore },
    });
  }
}

class RestScheduleApi implements IScheduleApi {
  constructor(private base: string) {}
  listToday()                                    { return apiFetch<ScheduleEntry[]>(`${this.base}/api/schedule/today`); }
  recordAttendance(id: string, present: boolean) { return apiFetch<ScheduleEntry>(`${this.base}/api/schedule/${id}/attendance`, { method: "PATCH", body: { present } }); }
}

class RestTokenApi implements ITokenApi {
  constructor(private base: string) {}
  balanceFor(clientId: string) { return apiFetch<{ balance: number }>(`${this.base}/api/tokens/balance/${clientId}`).then(r => r.balance); }
  historyFor(clientId: string) { return apiFetch<TokenTransaction[]>(`${this.base}/api/tokens/history/${clientId}`); }
  award(args: Parameters<ITokenApi["award"]>[0]) { return apiFetch<TokenTransaction>(`${this.base}/api/tokens/award`, { method: "POST", body: args }); }
  issueManual(args: Parameters<ITokenApi["issueManual"]>[0]) { return apiFetch<TokenTransaction>(`${this.base}/api/tokens/issue`, { method: "POST", body: args }); }
  approve(id: string, approverId: string) { return apiFetch<TokenTransaction>(`${this.base}/api/tokens/${id}/approve`, { method: "POST", body: { approverId } }); }
  reject(id: string, approverId: string, reason: string) { return apiFetch<TokenTransaction>(`${this.base}/api/tokens/${id}/reject`, { method: "POST", body: { approverId, reason } }); }
  revoke(id: string, requestedBy: string, reason: string) { return apiFetch<TokenTransaction>(`${this.base}/api/tokens/${id}/revoke`, { method: "POST", body: { requestedBy, reason } }); }
  pendingApprovals() { return apiFetch<TokenTransaction[]>(`${this.base}/api/tokens/pending`); }
  redemptionCatalogue() { return apiFetch<RedemptionCatalogueItem[]>(`${this.base}/api/tokens/catalogue`); }
  redeem(clientId: string, itemId: string) {
    return apiFetch<TokenTransaction>(`${this.base}/api/tokens/redeem`, { method: "POST", body: { clientId, itemId } });
  }
}

class RestConsentApi implements IConsentApi {
  constructor(private base: string) {}
  historyFor(clientId: string) { return apiFetch<ConsentEvent[]>(`${this.base}/api/consent/${clientId}`); }
  set(clientId: string, scope: ConsentEvent["scope"], granted: boolean) {
    return apiFetch<ConsentEvent>(`${this.base}/api/consent/${clientId}`, { method: "POST", body: { scope, granted } });
  }
}

class RestAuditApi implements IAuditApi {
  constructor(private base: string) {}
  list(limit = 200) { return apiFetch<AuditLog[]>(`${this.base}/api/audit?limit=${limit}`); }
  write(p: Omit<AuditLog, "_id" | "createdAt">) { return apiFetch<AuditLog>(`${this.base}/api/audit`, { method: "POST", body: p }); }
}

class RestAIApi implements IAIApi {
  constructor(private base: string) {}
  pendingFor(clinicianId: string) { return apiFetch<AIRecommendation[]>(`${this.base}/api/ai/pending/${clinicianId}`); }
  forClient(clientId: string) { return apiFetch<AIRecommendation[]>(`${this.base}/api/ai/client/${clientId}`); }
  approve(id: string, byUserId: string) { return apiFetch<AIRecommendation>(`${this.base}/api/ai/${id}/approve`, { method: "POST", body: { byUserId } }); }
  override(id: string, byUserId: string, reason: string) { return apiFetch<AIRecommendation>(`${this.base}/api/ai/${id}/override`, { method: "POST", body: { byUserId, reason } }); }
}

class RestPlanApi implements IPlanApi {
  constructor(private base: string) {}
  forClient(clientId: string) { return apiFetch<InterventionPlan | null>(`${this.base}/api/plans/client/${clientId}`); }
  save(plan: Omit<InterventionPlan, "_id" | "createdAt" | "updatedAt">) {
    return apiFetch<InterventionPlan>(`${this.base}/api/plans`, { method: "POST", body: plan });
  }
}

class RestContractApi implements IContractApi {
  constructor(private base: string) {}
  list() { return apiFetch<SmartContract[]>(`${this.base}/api/contracts`); }
  requestDeployment(id: string, requestedBy: string) { return apiFetch<SmartContract>(`${this.base}/api/contracts/${id}/request-deploy`, { method: "POST", body: { requestedBy } }); }
  approveDeployment(id: string, approvedBy: string) { return apiFetch<SmartContract>(`${this.base}/api/contracts/${id}/approve-deploy`, { method: "POST", body: { approvedBy } }); }
}

class RestMeasurementApi implements IMeasurementApi {
  constructor(private base: string) {}
  save(clientId: string, height: number, weight: number) {
    return apiFetch<Measurement>(`${this.base}/api/users/${clientId}/measurements`, { method: "POST", body: { height, weight } });
  }
  listForClient(clientId: string) {
    return apiFetch<Measurement[]>(`${this.base}/api/users/${clientId}/measurements`);
  }
}

class RestSubmissionApi implements ISubmissionApi {
  constructor(private base: string) {}
  submitVideo(args: Parameters<ISubmissionApi["submitVideo"]>[0]) {
    return apiFetch<VideoSubmission>(`${this.base}/api/submissions/video`, { method: "POST", body: args });
  }
  /** REST backend would return a signed streaming URL — not yet implemented. */
  getVideoUrl(_submissionId: string): string | null { return null; }
  listForClient(clientId: string) {
    return apiFetch<VideoSubmission[]>(`${this.base}/api/submissions/client/${clientId}`);
  }
  listPending() {
    return apiFetch<VideoSubmission[]>(`${this.base}/api/submissions/pending`);
  }
  async deleteOwn(id: string, clientId: string): Promise<void> {
    await apiFetch<void>(`${this.base}/api/submissions/${id}`, { method: "DELETE", body: { clientId } });
  }
  approve(args: Parameters<ISubmissionApi["approve"]>[0]) {
    return apiFetch<{ submission: VideoSubmission; session: AssessmentSession }>(`${this.base}/api/submissions/${args.id}/approve`, { method: "POST", body: args });
  }
  reject(id: string, reviewerId: string, notes: string) {
    return apiFetch<VideoSubmission>(`${this.base}/api/submissions/${id}/reject`, { method: "POST", body: { reviewerId, notes } });
  }
}

class RestQuestionnaireApi implements IQuestionnaireApi {
  constructor(private base: string) {}
  submit(args: Parameters<IQuestionnaireApi["submit"]>[0]) {
    return apiFetch<QuestionnaireSubmission>(`${this.base}/api/questionnaires`, { method: "POST", body: args });
  }
  listForClient(clientId: string) {
    return apiFetch<QuestionnaireSubmission[]>(`${this.base}/api/questionnaires/client/${clientId}`);
  }
}


import {
  MockAIApi, MockAuditApi, MockConsentApi, MockContractApi, MockMeasurementApi,
  MockPlanApi, MockQuestionnaireApi, MockScheduleApi, MockSessionApi,
  MockSubmissionApi, MockTokenApi, MockUserApi,
} from "./mockApi";

const USE_MOCK = (import.meta.env.VITE_USE_MOCK_API ?? "true") === "true";

export const userApi:      IUserApi     = USE_MOCK ? new MockUserApi()     : new RestUserApi(BASE_URL);
export const sessionApi:   ISessionApi  = USE_MOCK ? new MockSessionApi()  : new RestSessionApi(BASE_URL);
export const scheduleApi:  IScheduleApi = USE_MOCK ? new MockScheduleApi() : new RestScheduleApi(BASE_URL);
export const tokenApi:     ITokenApi    = USE_MOCK ? new MockTokenApi()    : new RestTokenApi(BASE_URL);
export const consentApi:   IConsentApi  = USE_MOCK ? new MockConsentApi()  : new RestConsentApi(BASE_URL);
export const auditApi:     IAuditApi    = USE_MOCK ? new MockAuditApi()    : new RestAuditApi(BASE_URL);
export const aiApi:        IAIApi       = USE_MOCK ? new MockAIApi()       : new RestAIApi(BASE_URL);
export const planApi:      IPlanApi     = USE_MOCK ? new MockPlanApi()     : new RestPlanApi(BASE_URL);
export const contractApi:  IContractApi = USE_MOCK ? new MockContractApi() : new RestContractApi(BASE_URL);
export const measurementApi:   IMeasurementApi   = USE_MOCK ? new MockMeasurementApi()   : new RestMeasurementApi(BASE_URL);
export const submissionApi:    ISubmissionApi    = USE_MOCK ? new MockSubmissionApi()    : new RestSubmissionApi(BASE_URL);
export const questionnaireApi: IQuestionnaireApi = USE_MOCK ? new MockQuestionnaireApi() : new RestQuestionnaireApi(BASE_URL);

if (typeof window !== "undefined") {
  console.info(
    `%c[HANA API] ${USE_MOCK ? "Using LOCAL MOCK backend" : "Using REST backend at " + BASE_URL}`,
    "color:#7c3aed;font-weight:bold",
  );
}
