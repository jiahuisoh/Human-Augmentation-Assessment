import type {
  AssessmentSession, AuditLog, AuthResponse, ConsentEvent,
  CvGrant, CvServiceProbe, EmergencyContact, InterventionPlan, LivenessProbe,
  Measurement, NewBooking, NewSessionPayload, NewUserPayload,
  PendingVerificationClient, ProfileUpdate, QuestionnaireSubmission, Role,
  ScheduleEntry, SystemHealth, TestId, User, VerificationStatus,
} from "../types";
import { clearToken, getToken, setToken } from "./tokenStore";
import { emitAuthFailure } from "./authEvents";


export const BASE_URL: string = import.meta.env.VITE_API_URL || "http://localhost:4502";

// Single source for where the CV service lives (TestRunner opens the socket,
// the developer health check probes the HTTP side). ws -> http, wss -> https.
// Default matches the cv-service host port from docker-compose.yml (4501 → 8000
// in container). Override via VITE_CV_WS_URL in frontend/.env.
export const CV_WS_URL: string = import.meta.env.VITE_CV_WS_URL || "ws://localhost:4501";
export const CV_HTTP_URL: string = CV_WS_URL.replace(/^ws/, "http");

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
    const d = data as { error?: string; code?: string };
    const sessionDead = res.status === 401 || (res.status === 403 && d.code === "ACCOUNT_SUSPENDED");
    if (sessionDead && token) {
      clearToken();
      emitAuthFailure(res.status === 403 ? d.error : "Your session has expired. Please sign in again.");
    }
    const errMsg = d.error || `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return {}; }
}

/**
 * Unauthenticated GET, for probing a service that is not ours. apiFetch would
 * attach the backend session token, and the CV service has no business
 * receiving it.
 */
async function probeFetch<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("UNREACHABLE");
  }
  if (!res.ok) throw new Error(`Responded ${res.status}`);
  const text = await res.text();
  return (text ? safeJson(text) : {}) as T;
}

export interface IUserApi {
  register(payload: NewUserPayload): Promise<User>;
  login(email: string, password: string): Promise<User>;
  getCurrent(): Promise<User>;
  getById(id: string): Promise<User>;
  list(): Promise<User[]>;
  create(payload: NewUserPayload & { role: Role }): Promise<User>;
  setStatus(id: string, verificationStatus: User["verificationStatus"]): Promise<User>;
  delete(id: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string, confirmNewPassword: string): Promise<User>;
  updateProfile(id: string, fields: ProfileUpdate): Promise<User>;
  saveEmergencyContact(id: string, contact: EmergencyContact): Promise<User>;
  verifyNric(id: string, nric: string): Promise<{ match: boolean; verificationStatus: VerificationStatus }>;
  updateNric(id: string, nric: string): Promise<User>;
  listPendingVerification(): Promise<PendingVerificationClient[]>;
  assignClient(clinicianId: string, clientId: string, assign: boolean): Promise<User>;
}

export interface ISessionApi {
  // Authorise one CV run. The returned token carries the client's real
  // demographics to the CV service, signed, so the browser cannot alter them.
  requestCvGrant(req: { testId: TestId; clientId?: string; sandbox?: boolean }): Promise<CvGrant>;
  // Submits only the CV service's signed outcome; the score and the clinical
  // verdict are both read/derived server-side.
  save(session: NewSessionPayload): Promise<AssessmentSession>;
  listForClient(clientId: string): Promise<AssessmentSession[]>;
  // The "before" score is derived server-side from the stored session (latest
  // override, else base result) so the audit trail can't be spoofed.
  override(id: string, reason: string, newScore: number): Promise<AssessmentSession>;
  // Permanent: the document is removed from MongoDB. The reason is recorded in
  // the audit log alongside a snapshot of the deleted record.
  delete(id: string, reason: string): Promise<{ deleted: boolean; _id: string }>;
}

export interface IConsentApi {
  historyFor(clientId: string): Promise<ConsentEvent[]>;
  set(clientId: string, scope: ConsentEvent["scope"], granted: boolean): Promise<ConsentEvent>;
}

export interface IAuditApi {
  list(limit?: number): Promise<AuditLog[]>;
}

export interface IScheduleApi {
  listToday(): Promise<ScheduleEntry[]>;
  upcomingForClient(clientId: string): Promise<ScheduleEntry[]>;
  book(booking: NewBooking): Promise<ScheduleEntry>;
  recordAttendance(id: string, present: boolean): Promise<ScheduleEntry>;
  cancel(id: string): Promise<void>;
}

export interface IHealthApi {
  // Is the API process answering at all. Unauthenticated, so it still reports
  // when the session is the broken part.
  liveness(): Promise<LivenessProbe>;
  // Detail: database round-trip, uptime, signing-secret presence.
  system(): Promise<SystemHealth>;
  // Probed straight from the browser, because that is the path a real
  // assessment takes - the backend never calls the CV service.
  cvService(): Promise<CvServiceProbe>;
}

export interface IPlanApi {
  forClient(clientId: string): Promise<InterventionPlan | null>;
  save(plan: Omit<InterventionPlan, "_id" | "createdAt" | "updatedAt">): Promise<InterventionPlan>;
}

export interface IMeasurementApi {
  save(clientId: string, height: number, weight: number): Promise<Measurement>;
  listForClient(clientId: string): Promise<Measurement[]>;
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
  async changePassword(currentPassword: string, newPassword: string, confirmNewPassword: string): Promise<User> {
    const r = await apiFetch<AuthResponse>(`${this.base}/api/users/me/password`, {
      method: "PATCH", body: { currentPassword, newPassword, confirmNewPassword },
    });
    setToken(r.token);
    return r.user;
  }
  updateProfile(id: string, fields: ProfileUpdate) {
    return apiFetch<User>(`${this.base}/api/users/${id}/profile`, { method: "PATCH", body: fields });
  }
  saveEmergencyContact(id: string, contact: EmergencyContact) {
    return apiFetch<User>(`${this.base}/api/users/${id}/emergency`, { method: "PATCH", body: contact });
  }
  verifyNric(id: string, nric: string) {
    return apiFetch<{ match: boolean; verificationStatus: VerificationStatus }>(`${this.base}/api/staff/users/${id}/verify-nric`, { method: "POST", body: { nric } });
  }
  updateNric(id: string, nric: string) {
    return apiFetch<User>(`${this.base}/api/users/${id}/nric`, { method: "PATCH", body: { nric } });
  }
  listPendingVerification() {
    return apiFetch<PendingVerificationClient[]>(`${this.base}/api/staff/clients/pending-verification`);
  }
}

class RestSessionApi implements ISessionApi {
  constructor(private base: string) {}
  requestCvGrant(req: { testId: TestId; clientId?: string; sandbox?: boolean }) {
    return apiFetch<CvGrant>(`${this.base}/api/sessions/cv-grant`, { method: "POST", body: req });
  }
  save(s: NewSessionPayload) {
    return apiFetch<AssessmentSession>(`${this.base}/api/sessions`, { method: "POST", body: s });
  }
  listForClient(clientId: string) {
    return apiFetch<AssessmentSession[]>(`${this.base}/api/sessions/client/${clientId}`);
  }
  override(id: string, reason: string, newScore: number) {
    return apiFetch<AssessmentSession>(`${this.base}/api/sessions/${id}/override`, {
      method: "PATCH",
      body: { reason, newScore },
    });
  }
  delete(id: string, reason: string) {
    return apiFetch<{ deleted: boolean; _id: string }>(`${this.base}/api/sessions/${id}`, {
      method: "DELETE",
      body: { reason },
    });
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
}

class RestPlanApi implements IPlanApi {
  constructor(private base: string) {}
  forClient(clientId: string) { return apiFetch<InterventionPlan | null>(`${this.base}/api/plans/client/${clientId}`); }
  save(plan: Omit<InterventionPlan, "_id" | "createdAt" | "updatedAt">) {
    return apiFetch<InterventionPlan>(`${this.base}/api/plans`, { method: "POST", body: plan });
  }
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

class RestScheduleApi implements IScheduleApi {
  constructor(private base: string) {}
  listToday()                          { return apiFetch<ScheduleEntry[]>(`${this.base}/api/schedule/today`); }
  upcomingForClient(clientId: string)  { return apiFetch<ScheduleEntry[]>(`${this.base}/api/schedule/client/${clientId}`); }
  book(booking: NewBooking)            { return apiFetch<ScheduleEntry>(`${this.base}/api/schedule`, { method: "POST", body: booking }); }
  recordAttendance(id: string, present: boolean) {
    return apiFetch<ScheduleEntry>(`${this.base}/api/schedule/${id}/attendance`, { method: "PATCH", body: { present } });
  }
  cancel(id: string)                   { return apiFetch<void>(`${this.base}/api/schedule/${id}`, { method: "DELETE" }); }
}

class RestHealthApi implements IHealthApi {
  constructor(private base: string, private cvBase: string) {}
  liveness()  { return apiFetch<LivenessProbe>(`${this.base}/health`); }
  system()    { return apiFetch<SystemHealth>(`${this.base}/api/health`); }
  cvService() { return probeFetch<CvServiceProbe>(`${this.cvBase}/health`); }
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


export const userApi:      IUserApi     = new RestUserApi(BASE_URL);
export const sessionApi:   ISessionApi  = new RestSessionApi(BASE_URL);
export const consentApi:   IConsentApi  = new RestConsentApi(BASE_URL);
export const auditApi:     IAuditApi    = new RestAuditApi(BASE_URL);
export const scheduleApi:  IScheduleApi = new RestScheduleApi(BASE_URL);
export const healthApi:    IHealthApi   = new RestHealthApi(BASE_URL, CV_HTTP_URL);
export const planApi:      IPlanApi     = new RestPlanApi(BASE_URL);
export const measurementApi:   IMeasurementApi   = new RestMeasurementApi(BASE_URL);
export const questionnaireApi: IQuestionnaireApi = new RestQuestionnaireApi(BASE_URL);
