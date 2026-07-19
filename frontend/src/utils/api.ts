import type {
  AssessmentSession, AuditLog, AuthResponse, ConsentEvent,
  EmergencyContact, InterventionPlan, Measurement, NewUserPayload,
  PendingVerificationClient, ProfileUpdate, QuestionnaireSubmission, Role,
  ScheduleEntry, User, VerificationStatus,
} from "../types";
import { clearToken, getToken, setToken } from "./tokenStore";
import { emitAuthFailure } from "./authEvents";


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
  save(session: Omit<AssessmentSession, "_id" | "createdAt">): Promise<AssessmentSession>;
  listForClient(clientId: string): Promise<AssessmentSession[]>;
  // The "before" score is derived server-side from the stored session (latest
  // override, else base result) so the audit trail can't be spoofed.
  override(id: string, reason: string, newScore: number): Promise<AssessmentSession>;
}

export interface IScheduleApi {
  listToday(): Promise<ScheduleEntry[]>;
  recordAttendance(id: string, present: boolean): Promise<ScheduleEntry>;
}

export interface IConsentApi {
  historyFor(clientId: string): Promise<ConsentEvent[]>;
  set(clientId: string, scope: ConsentEvent["scope"], granted: boolean): Promise<ConsentEvent>;
}

export interface IAuditApi {
  list(limit?: number): Promise<AuditLog[]>;
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
  save(s: Omit<AssessmentSession, "_id" | "createdAt">) {
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
}

class RestScheduleApi implements IScheduleApi {
  constructor(private base: string) {}
  listToday()                                    { return apiFetch<ScheduleEntry[]>(`${this.base}/api/schedule/today`); }
  recordAttendance(id: string, present: boolean) { return apiFetch<ScheduleEntry>(`${this.base}/api/schedule/${id}/attendance`, { method: "PATCH", body: { present } }); }
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
export const scheduleApi:  IScheduleApi = new RestScheduleApi(BASE_URL);
export const consentApi:   IConsentApi  = new RestConsentApi(BASE_URL);
export const auditApi:     IAuditApi    = new RestAuditApi(BASE_URL);
export const planApi:      IPlanApi     = new RestPlanApi(BASE_URL);
export const measurementApi:   IMeasurementApi   = new RestMeasurementApi(BASE_URL);
export const questionnaireApi: IQuestionnaireApi = new RestQuestionnaireApi(BASE_URL);
