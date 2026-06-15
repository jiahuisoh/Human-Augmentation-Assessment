import type {
  AIRecommendation, AssessmentSession, AuditLog, ConsentEvent, EmergencyContact,
  InterventionPlan, Measurement, NewUserPayload, QuestionnaireSubmission,
  Role, ScheduleEntry,
  User,
} from "../types";
import {
  type IAIApi, type IAuditApi, type IConsentApi,
  type IMeasurementApi, type IPlanApi, type IQuestionnaireApi, type IScheduleApi,
  type ISessionApi, type IUserApi,
} from "./api";
import { setToken } from "./tokenStore";

const LS_KEY = "hana.mock.db.v7";

interface MockDb {
  users: User[];
  passwords: Record<string, string>;
  sessions: AssessmentSession[];
  schedule: ScheduleEntry[];
  consents: ConsentEvent[];
  audits: AuditLog[];
  aiRecs: AIRecommendation[];
  plans: InterventionPlan[];
  measurements: Measurement[];
  questionnaires: QuestionnaireSubmission[];
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
function nowIso(): string { return new Date().toISOString(); }

function seedDb(): MockDb {
  const userClient: User = {
    _id: "u_client_001", email: "client@hana.sg", name: "Tan Ah Kow",
    role: "client", dateOfBirth: "1953-04-12", gender: "male",
    height: 162, weight: 64, verificationStatus: "unverified",
    programmeIds: ["pg_aac"], createdAt: nowIso(),
  };
  const userStaff: User = {
    _id: "u_staff_001", email: "staff@hana.sg", name: "Sarah Lim",
    role: "staff", verificationStatus: "verified",
    programmeIds: ["pg_aac"], createdAt: nowIso(),
  };
  const userClin: User = {
    _id: "u_clin_001", email: "clinician@hana.sg", name: "Dr James Ong",
    role: "clinician", verificationStatus: "verified",
    assignedClientIds: ["u_client_001", "u_client_002"], createdAt: nowIso(),
  };
  const userDev: User = {
    _id: "u_dev_001", email: "developer@hana.sg", name: "Wei Developer",
    role: "developer", verificationStatus: "verified", createdAt: nowIso(),
  };
  const userAdmin: User = {
    _id: "u_admin_001", email: "admin@hana.sg", name: "SIT Admin",
    role: "administrator", verificationStatus: "verified", createdAt: nowIso(),
  };
  const userClient2: User = {
    _id: "u_client_002", email: "siti@hana.sg", name: "Siti Rahimah",
    role: "client", dateOfBirth: "1957-09-03", gender: "female",
    height: 158, weight: 58, verificationStatus: "verified",
    programmeIds: ["pg_aac"], createdAt: nowIso(),
  };

  return {
    users: [userClient, userClient2, userStaff, userClin, userDev, userAdmin],
    passwords: {
      "client@hana.sg": "password", "siti@hana.sg": "password",
      "staff@hana.sg": "password", "clinician@hana.sg": "password",
      "developer@hana.sg": "password", "admin@hana.sg": "password",
    },
    sessions: [
      { _id: "s1", clientId: "u_client_001", conductedBy: "u_clin_001", testId: "chair_stand", reps: 14, classification: "Average", riskLevel: "moderate", interpretation: "Within age-typical range; mild improvement target.", normLow: 12, normHigh: 17, livenessScore: 0.86, recordHash: "0x3f2ac1d9...", createdAt: nowIso() },
      { _id: "s2", clientId: "u_client_001", conductedBy: "u_clin_001", testId: "sit_reach",   measurement: 5.4, classification: "Good",    riskLevel: "low",      livenessScore: 0.91, recordHash: "0x7a1be4f2...", createdAt: nowIso() },
    ],
    schedule: [
      { _id: "sc1", clientId: "u_client_001", clientName: "Tan Ah Kow",    testId: "chair_stand", time: "09:00", status: "completed",    nricVerified: true  },
      { _id: "sc2", clientId: "u_client_002", clientName: "Siti Rahimah",  testId: "back_scratch",time: "09:30", status: "pending_nric", nricVerified: false },
      { _id: "sc3", clientId: "u_client_001", clientName: "Wong Chee Keong",testId: "chair_stand",time: "10:00", status: "in_progress", nricVerified: true  },
      { _id: "sc4", clientId: "u_client_002", clientName: "Lim Bee Hoon",  testId: "sit_reach",   time: "10:30", status: "scheduled",    nricVerified: true  },
      { _id: "sc5", clientId: "u_client_001", clientName: "Muthu Krishnan",testId: "back_scratch",time: "11:00", status: "scheduled",    nricVerified: false },
    ],
    consents: [
      { _id: "c1", clientId: "u_client_001", scope: "research",       granted: true,  txHash: "0xa1b2c3...", createdAt: nowIso() },
      { _id: "c2", clientId: "u_client_001", scope: "clinician_share",granted: true,  txHash: "0xd4e5f6...", createdAt: nowIso() },
      { _id: "c3", clientId: "u_client_001", scope: "third_party",    granted: false, txHash: "0xe7f8a9...", createdAt: nowIso() },
    ],
    audits: [
      { _id: "a1", actorId: "u_admin_001", actorRole: "administrator", category: "TOKEN",    level: "INFO", message: "Administrator approved +100 tokens for Tan Ah Kow — adherence milestone", createdAt: nowIso() },
      { _id: "a2", actorId: "u_staff_001", actorRole: "staff",         category: "AUTH",     level: "INFO", message: "NRIC verified — Siti Rahimah by staff Sarah Lim", createdAt: nowIso() },
      { _id: "a3", actorId: "u_clin_001",  actorRole: "clinician",     category: "TOKEN",    level: "WARN", message: "Token revocation requested by clinician — reason: incorrectly issued", createdAt: nowIso() },
      { _id: "a4", actorId: "u_admin_001", actorRole: "administrator", category: "ADMIN",    level: "INFO", message: "New clinician account created — Dr James Ong", createdAt: nowIso() },
      { _id: "a5", actorId: "u_dev_001",   actorRole: "developer",     category: "CONTRACT", level: "INFO", message: "IncentiveToken.sol v2.2.0-dev approved for sandbox deployment", createdAt: nowIso() },
      { _id: "a6", actorId: "u_client_001",actorRole: "client",        category: "CONSENT",  level: "WARN", message: "Consent revoked by client for third-party data sharing", createdAt: nowIso() },
      { _id: "a7", actorId: "u_clin_001",  actorRole: "clinician",     category: "AI",       level: "INFO", message: "AI recommendation approved — balance training increase", createdAt: nowIso() },
    ],
    aiRecs: [
      { _id: "ai1", clientId: "u_client_001", title: "Increase balance training frequency", detail: "23% improvement but plateau suggests increased dosage would benefit.", confidence: 87, basis: "3 months of session data", status: "pending", createdAt: nowIso() },
      { _id: "ai2", clientId: "u_client_001", title: "Refer for grip strength specialist",  detail: "Grip strength below age-appropriate norms for 3 consecutive assessments.", confidence: 79, basis: "Clinical norms",         status: "pending", createdAt: nowIso() },
    ],
    plans: [
      { _id: "pl1", clientId: "u_client_001", authoredBy: "u_clin_001",
        items: [
          { activity: "Morning walk",            frequency: "Daily",      duration: "20 min", done: true  },
          { activity: "Chair stand exercises",   frequency: "3× per week", duration: "10 min", done: true  },
          { activity: "Balance training",         frequency: "2× per week", duration: "15 min", done: false },
          { activity: "Flexibility stretching",   frequency: "Daily",      duration: "10 min", done: false },
        ], createdAt: nowIso(), updatedAt: nowIso() },
    ],
    measurements: (() => {
      const items: Measurement[] = [];
      const heights = [162, 162, 162, 162, 162, 162];
      const weights = [68, 67.5, 67, 66.5, 66, 65.4];
      for (let i = 0; i < 6; i++) {
        const h = heights[i], w = weights[i];
        const days = (5 - i) * 7;
        const d = new Date(); d.setDate(d.getDate() - days);
        items.push({
          _id: `m${i + 1}`, clientId: "u_client_001",
          height: h, weight: w,
          bmi: +(w / ((h / 100) ** 2)).toFixed(1),
          createdAt: d.toISOString(),
        });
      }
      return items;
    })(),
    questionnaires: [
      { _id: "q1", clientId: "u_client_001",
        answers: { balance: 4, mobility: 4, falls_7d: false, pain_standing: false, walk_minutes: 25 },
        submittedAt: nowIso() },
    ],
  };
}

function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {}
  const seeded = seedDb();
  persistDb(seeded);
  return seeded;
}

function persistDb(db: MockDb): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch {}
}

const db: MockDb = loadDb();

export class MockUserApi implements IUserApi {
  async register(p: NewUserPayload): Promise<User> {
    if (db.users.some(u => u.email === p.email)) throw new Error("Email already registered.");
    const u: User = {
      _id: uid("u"), email: p.email, name: p.name, role: "client",
      dateOfBirth: p.dateOfBirth, gender: p.gender, height: p.height, weight: p.weight,
      verificationStatus: "unverified", createdAt: nowIso(),
    };
    db.users.push(u);
    db.passwords[p.email] = p.password;
    persistDb(db);
    setToken(`mock-jwt-${u._id}`);
    return u;
  }
  async login(email: string, password: string): Promise<User> {
    const u = db.users.find(x => x.email === email);
    if (!u) throw new Error("No account with that email.");
    if (db.passwords[email] !== password) throw new Error("Incorrect password.");
    setToken(`mock-jwt-${u._id}`);
    return u;
  }
  async getCurrent(): Promise<User> {
    const token = (localStorage.getItem("hana.auth.token") || "").replace("mock-jwt-", "");
    const u = db.users.find(x => x._id === token);
    if (!u) throw new Error("Not authenticated");
    return u;
  }
  async getById(id: string): Promise<User> {
    const u = db.users.find(x => x._id === id);
    if (!u) throw new Error("User not found");
    return u;
  }
  async list(): Promise<User[]> { return [...db.users]; }
  async create(p: NewUserPayload & { role: Role }): Promise<User> {
    if (db.users.some(u => u.email === p.email)) throw new Error("Email already in use.");
    const u: User = {
      _id: uid("u"), email: p.email, name: p.name, role: p.role,
      dateOfBirth: p.dateOfBirth, gender: p.gender, height: p.height, weight: p.weight,
      verificationStatus: p.role === "client" ? "unverified" : "verified",
      createdAt: nowIso(),
    };
    db.users.push(u);
    db.passwords[p.email] = p.password;
    persistDb(db);
    return u;
  }
  async setStatus(id: string, verificationStatus: User["verificationStatus"]): Promise<User> {
    const u = db.users.find(x => x._id === id);
    if (!u) throw new Error("User not found");
    u.verificationStatus = verificationStatus;
    persistDb(db);
    return u;
  }
  async delete(id: string): Promise<void> {
    const i = db.users.findIndex(x => x._id === id);
    if (i >= 0) db.users.splice(i, 1);
    persistDb(db);
  }
  async assignClient(clinicianId: string, clientId: string, assign: boolean): Promise<User> {
    const clinician = db.users.find(u => u._id === clinicianId);
    if (!clinician) throw new Error("Clinician not found");
    const current = clinician.assignedClientIds ?? [];
    clinician.assignedClientIds = assign
      ? [...new Set([...current, clientId])]
      : current.filter(id => id !== clientId);
    persistDb(db);
    return clinician;
  }
  async saveEmergencyContact(id: string, contact: EmergencyContact): Promise<void> {
    const u = db.users.find(x => x._id === id);
    if (!u) throw new Error("User not found");
    u.emergencyContact = contact;
    persistDb(db);
  }
  async verifyNric(id: string, _nricLast4: string): Promise<User> {
    const u = db.users.find(x => x._id === id);
    if (!u) throw new Error("User not found");
    u.verificationStatus = "verified";
    persistDb(db);
    return u;
  }
}

export class MockSessionApi implements ISessionApi {
  async save(s: Omit<AssessmentSession, "_id" | "createdAt">): Promise<AssessmentSession> {
    const session: AssessmentSession = { ...s, _id: uid("s"), createdAt: nowIso() };
    db.sessions.unshift(session);
    persistDb(db);
    return session;
  }
  async listForClient(clientId: string): Promise<AssessmentSession[]> {
    return db.sessions.filter(s => s.clientId === clientId);
  }
  async override(id: string, byUserId: string, byRole: Role, reason: string, originalScore: number, newScore: number): Promise<AssessmentSession> {
    const s = db.sessions.find(x => x._id === id);
    if (!s) throw new Error("Session not found");
    s.overrides = [...(s.overrides ?? []), { by: byUserId, byRole, reason, originalScore, newScore, at: nowIso() }];
    if (s.reps !== undefined) s.reps = newScore;
    else s.measurement = newScore;
    persistDb(db);
    return s;
  }
}

export class MockScheduleApi implements IScheduleApi {
  async listToday(): Promise<ScheduleEntry[]> { return [...db.schedule]; }
  async recordAttendance(id: string, present: boolean): Promise<ScheduleEntry> {
    const e = db.schedule.find(x => x._id === id);
    if (!e) throw new Error("Schedule entry not found");
    e.status = present ? "present" : "absent";
    persistDb(db);
    return e;
  }
}

export class MockConsentApi implements IConsentApi {
  async historyFor(clientId: string): Promise<ConsentEvent[]> {
    return db.consents.filter(c => c.clientId === clientId);
  }
  async set(clientId: string, scope: ConsentEvent["scope"], granted: boolean): Promise<ConsentEvent> {
    const e: ConsentEvent = {
      _id: uid("c"), clientId, scope, granted,
      txHash: "0x" + Math.random().toString(16).slice(2, 18),
      createdAt: nowIso(),
    };
    db.consents.unshift(e);
    persistDb(db);
    return e;
  }
}

export class MockAuditApi implements IAuditApi {
  async list(limit = 200): Promise<AuditLog[]> {
    return [...db.audits].slice(0, limit);
  }
  async write(p: Omit<AuditLog, "_id" | "createdAt">): Promise<AuditLog> {
    const log: AuditLog = { ...p, _id: uid("a"), createdAt: nowIso() };
    db.audits.unshift(log);
    persistDb(db);
    return log;
  }
}

export class MockAIApi implements IAIApi {
  async pendingFor(_clinicianId: string): Promise<AIRecommendation[]> {
    return db.aiRecs.filter(r => r.status === "pending");
  }
  async forClient(clientId: string): Promise<AIRecommendation[]> {
    return db.aiRecs.filter(r => r.clientId === clientId && r.status === "approved");
  }
  async approve(id: string, byUserId: string): Promise<AIRecommendation> {
    const r = db.aiRecs.find(x => x._id === id);
    if (!r) throw new Error("Recommendation not found");
    r.status = "approved";
    r.reviewedBy = byUserId;
    persistDb(db);
    return r;
  }
  async override(id: string, byUserId: string, reason: string): Promise<AIRecommendation> {
    const r = db.aiRecs.find(x => x._id === id);
    if (!r) throw new Error("Recommendation not found");
    r.status = "overridden";
    r.reviewedBy = byUserId;
    r.overrideReason = reason;
    persistDb(db);
    return r;
  }
}

export class MockPlanApi implements IPlanApi {
  async forClient(clientId: string): Promise<InterventionPlan | null> {
    return db.plans.find(p => p.clientId === clientId) ?? null;
  }
  async save(plan: Omit<InterventionPlan, "_id" | "createdAt" | "updatedAt">): Promise<InterventionPlan> {
    const existing = db.plans.findIndex(p => p.clientId === plan.clientId);
    const stamp = nowIso();
    if (existing >= 0) {
      db.plans[existing] = { ...db.plans[existing], ...plan, updatedAt: stamp };
      persistDb(db);
      return db.plans[existing];
    }
    const created: InterventionPlan = { ...plan, _id: uid("pl"), createdAt: stamp, updatedAt: stamp };
    db.plans.push(created);
    persistDb(db);
    return created;
  }
}

export class MockMeasurementApi implements IMeasurementApi {
  async save(clientId: string, height: number, weight: number): Promise<Measurement> {
    const m: Measurement = {
      _id: uid("m"), clientId, height, weight,
      bmi: +(weight / ((height / 100) ** 2)).toFixed(1),
      createdAt: nowIso(),
    };
    db.measurements.push(m);
    persistDb(db);
    return m;
  }
  async listForClient(clientId: string): Promise<Measurement[]> {
    return db.measurements.filter(m => m.clientId === clientId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}


export class MockQuestionnaireApi implements IQuestionnaireApi {
  async submit(args: Parameters<IQuestionnaireApi["submit"]>[0]): Promise<QuestionnaireSubmission> {
    const q: QuestionnaireSubmission = {
      _id: uid("q"),
      clientId: args.clientId,
      answers: args.answers,
      submittedAt: nowIso(),
    };
    db.questionnaires.unshift(q);
    persistDb(db);
    return q;
  }

  async listForClient(clientId: string): Promise<QuestionnaireSubmission[]> {
    return db.questionnaires.filter(q => q.clientId === clientId);
  }
}

