import { useEffect, useState } from "react";
import {
  Users, ClipboardList, Brain, Activity, BarChart2, Coins, ArrowLeft,
} from "lucide-react";
import { firstNameOf } from "../../utils/helpers";
import { LIVENESS_THRESHOLD } from "../../utils/constants";
import {
  aiApi, auditApi, planApi, sessionApi, submissionApi, tokenApi, userApi,
} from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import TestRunner from "../../cv/TestRunner";
import type { TestOutcomeWire } from "../../cv/wireTypes";
import type {
  AIRecommendation, InterventionPlanItem, TestId, User, VideoSubmission,
} from "../../types";

import { calcAge, type PatientView } from "./ClinicianShared";

import Overview      from "./tabs/Overview";
import PatientList   from "./tabs/PatientList";
import PatientDetail from "./tabs/PatientDetail";
import Assessments   from "./tabs/Assessments";
import AI            from "./tabs/AI";
import Plans         from "./tabs/Plans";
import Tokens        from "./tabs/Tokens";

type TabId = "overview" | "patients" | "assessments" | "ai" | "plans" | "tokens";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "overview",    label: "Overview",    Icon: BarChart2     },
  { id: "patients",    label: "My Patients", Icon: Users         },
  { id: "assessments", label: "Assessments", Icon: ClipboardList },
  { id: "ai",          label: "AI Insights", Icon: Brain         },
  { id: "plans",       label: "Care Plans",  Icon: Activity      },
  { id: "tokens",      label: "Incentives",  Icon: Coins         },
];

interface ClinicianProps {
  user: User;
  onSignOut: () => void;
}

export default function Clinician({ user, onSignOut }: ClinicianProps) {
  const [tab, setTab]                 = useState<TabId>("overview");
  const [patients, setPatients]       = useState<PatientView[]>([]);
  const [selected, setSelected]       = useState<PatientView | null>(null);
  const [aiRecs, setAiRecs]           = useState<AIRecommendation[]>([]);
  const [search, setSearch]           = useState("");
  const [activeCv, setActiveCv]       = useState<{ clientId: string; testId: TestId } | null>(null);
  const [submissions, setSubmissions] = useState<VideoSubmission[]>([]);

  useEffect(() => {
    void loadPatients();
    void aiApi.pendingFor(user._id).then(setAiRecs);
    void reloadSubmissions();
  }, []);

  async function reloadSubmissions(): Promise<void> {
    const all = await submissionApi.listPending();
    const assigned = new Set(user.assignedClientIds ?? []);
    setSubmissions(all.filter(s => assigned.has(s.clientId)));
  }

  async function loadPatients(): Promise<void> {
    const ids = user.assignedClientIds ?? [];
    const loaded: PatientView[] = await Promise.all(ids.map(async id => {
      const [u, s, p, b] = await Promise.all([
        userApi.getById(id),
        sessionApi.listForClient(id),
        planApi.forClient(id),
        tokenApi.balanceFor(id),
      ]);
      return { user: u, sessions: s, plan: p, tokenBalance: b };
    }));
    setPatients(loaded);
  }

  const handleCvComplete = async (outcome: TestOutcomeWire): Promise<void> => {
    if (!activeCv) return;
    const client = await userApi.getById(activeCv.clientId);
    const saved = await sessionApi.save({
      clientId: activeCv.clientId, conductedBy: user._id, testId: activeCv.testId,
      reps: outcome.reps, measurement: outcome.measurement,
      classification: outcome.classification, riskLevel: outcome.risk_level,
      interpretation: outcome.interpretation,
      normLow: outcome.norm_low, normHigh: outcome.norm_high,
      terminatedEarly: outcome.terminated_early, livenessScore: outcome.liveness_score,
      recordHash: "0x" + Math.random().toString(16).slice(2, 18),
    });
    await auditApi.write({
      actorId: user._id, actorRole: "clinician", category: "CV", level: "INFO",
      message: `Clinician conducted ${activeCv.testId} for client ${activeCv.clientId}`,
      context: { sessionId: saved._id, liveness: outcome.liveness_score },
    });

    // System-triggered token award (HANA doc: "Earn tokens for assessment completion: Yes, system-triggered").
    // Gates: client must be verified AND liveness must clear the threshold.
    const livenessOK = (outcome.liveness_score ?? 0) >= LIVENESS_THRESHOLD;
    if (client.verificationStatus === "verified" && livenessOK) {
      await tokenApi.award({
        clientId: activeCv.clientId, amount: 25, eventType: "assessment_complete",
        livenessScore: outcome.liveness_score, sessionId: saved._id,
      });
    }

    await loadPatients();
    setActiveCv(null);
  };

  const handleApproveSubmission = async (
    sub: VideoSubmission,
    overrides: { reps?: number; measurement?: number; classification?: string; notes?: string },
  ): Promise<void> => {
    await submissionApi.approve({
      id: sub._id, reviewerId: user._id, reviewerRole: "clinician",
      ...overrides,
    });
    // approve() already writes its own audit + awards tokens; just refresh.
    await reloadSubmissions();
    await loadPatients();
  };

  const handleRejectSubmission = async (sub: VideoSubmission, notes: string): Promise<void> => {
    await submissionApi.reject(sub._id, user._id, notes);
    await reloadSubmissions();
  };

  const handleOverride = async (sessionId: string, reason: string, original: number, next: number): Promise<void> => {
    await sessionApi.override(sessionId, user._id, "clinician", reason, original, next);
    await auditApi.write({
      actorId: user._id, actorRole: "clinician", category: "ASSESSMENT", level: "WARN",
      message: `Score override on session ${sessionId} — reason: ${reason}`,
    });
    await loadPatients();
  };

  const handleApproveAI = async (id: string): Promise<void> => {
    await aiApi.approve(id, user._id);
    await auditApi.write({ actorId: user._id, actorRole: "clinician", category: "AI", level: "INFO", message: `AI recommendation ${id} approved` });
    setAiRecs(prev => prev.filter(r => r._id !== id));
  };

  const handleOverrideAI = async (id: string, reason: string): Promise<void> => {
    await aiApi.override(id, user._id, reason);
    await auditApi.write({ actorId: user._id, actorRole: "clinician", category: "AI", level: "WARN", message: `AI recommendation ${id} overridden — ${reason}` });
    setAiRecs(prev => prev.filter(r => r._id !== id));
  };

  const handleSavePlan = async (clientId: string, items: InterventionPlanItem[]): Promise<void> => {
    const plan = await planApi.save({ clientId, authoredBy: user._id, items });
    await auditApi.write({ actorId: user._id, actorRole: "clinician", category: "ASSESSMENT", level: "INFO", message: `Intervention plan saved for client ${clientId}` });
    setPatients(prev => prev.map(p => p.user._id === clientId ? { ...p, plan } : p));
  };

  const handleIssueToken = async (clientId: string, amount: number, reason: string): Promise<void> => {
    await tokenApi.issueManual({ clientId, amount, issuedBy: user._id, reason });
    await auditApi.write({ actorId: user._id, actorRole: "clinician", category: "TOKEN", level: "INFO", message: `Clinician issued ${amount} tokens to client ${clientId} — ${reason}` });
    await loadPatients();
  };

  if (activeCv) {
    const p = patients.find(x => x.user._id === activeCv.clientId);
    return (
      <TestRunner
        testId={activeCv.testId}
        userAge={calcAge(p?.user.dateOfBirth)}
        userSex={p?.user.gender ?? "other"}
        userHeight={p?.user.height ?? null}
        onComplete={handleCvComplete}
        onBack={() => setActiveCv(null)}
      />
    );
  }

  return (
    <SidebarLayout
      user={user} tabs={TABS} activeTab={tab}
      onTab={id => { setTab(id as TabId); setSelected(null); }}
      onSignOut={onSignOut} accent="violet"
      headerLeft={selected ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm">
            <ArrowLeft size={15} /> Back
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-900">{selected.user.name}</span>
        </div>
      ) : (
        <div>
          <div className="text-base font-semibold text-gray-900">Good morning, Dr {firstNameOf(user.name)}</div>
          <div className="text-xs text-gray-400">You have {patients.length} assigned patients</div>
        </div>
      )}
    >
      {tab === "overview"    && !selected && <Overview      patients={patients} aiCount={aiRecs.length} onOpen={p => { setSelected(p); setTab("patients"); }} onGoAI={() => setTab("ai")} />}
      {tab === "patients"    && !selected && <PatientList   patients={patients} search={search} onSearch={setSearch} onOpen={setSelected} />}
      {tab === "patients"    && selected  && <PatientDetail patient={selected} onOverride={handleOverride} />}
      {tab === "assessments" && (
        <Assessments
          patients={patients}
          submissions={submissions}
          onLaunchCV={(clientId, testId) => setActiveCv({ clientId, testId })}
          onApproveSubmission={handleApproveSubmission}
          onRejectSubmission={handleRejectSubmission}
        />
      )}
      {tab === "ai"          && <AI          recs={aiRecs} onApprove={handleApproveAI} onOverride={handleOverrideAI} />}
      {tab === "plans"       && <Plans       patients={patients} onSave={handleSavePlan} />}
      {tab === "tokens"      && <Tokens      patients={patients} onIssue={handleIssueToken} />}
    </SidebarLayout>
  );
}
