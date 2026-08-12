import { useEffect, useState } from "react";
import {
  Users, ClipboardList, Activity, BarChart2, ArrowLeft,
} from "lucide-react";
import { firstNameOf, greeting } from "../../utils/helpers";
import {
  planApi, scheduleApi, sessionApi, userApi,
} from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import TestRunner from "../../cv/TestRunner";
import AssessmentResult from "../../cv/AssessmentResult";
import type { TestOutcomeWire } from "../../cv/wireTypes";
import type {
  AssessmentSession, InterventionPlanItem, ScheduleEntry, TestId, User,
} from "../../types";

import { byDateTime, type PatientView } from "./ClinicianShared";

import Overview      from "./tabs/Overview";
import PatientList   from "./tabs/PatientList";
import PatientDetail from "./tabs/PatientDetail";
import Assessments   from "./tabs/Assessments";
import Plans         from "./tabs/Plans";

type TabId = "overview" | "patients" | "assessments" | "plans";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "overview",    label: "Overview",    Icon: BarChart2     },
  { id: "patients",    label: "My Patients", Icon: Users         },
  { id: "assessments", label: "Assessments", Icon: ClipboardList },
  { id: "plans",       label: "Intervention Plans",  Icon: Activity      },
];

interface ClinicianProps {
  user: User;
  onSignOut: () => void;
}

export default function Clinician({ user, onSignOut }: ClinicianProps) {
  const [tab, setTab]                 = useState<TabId>("overview");
  const [patients, setPatients]       = useState<PatientView[]>([]);
  const [selected, setSelected]       = useState<PatientView | null>(null);
  const [search, setSearch]           = useState("");
  const [activeCv, setActiveCv]       = useState<{ clientId: string; testId: TestId; token: string } | null>(null);
  const [result,   setResult]         = useState<AssessmentSession | null>(null);

  const greetWord = greeting();

  useEffect(() => {
    void loadPatients();
  }, []);

  async function loadPatients(): Promise<void> {
    let ids = user.assignedClientIds ?? [];
    try {
      ids = (await userApi.getCurrent()).assignedClientIds ?? ids;
    } catch {}
    const loaded = await Promise.all(ids.map(async id => {
      try {
        const [u, s, p, sched] = await Promise.all([
          userApi.getById(id),
          sessionApi.listForClient(id),
          planApi.forClient(id),
          scheduleApi.upcomingForClient(id),
        ]);
        return { user: u, sessions: s, plan: p, schedule: sched } as PatientView;
      } catch {
        return null;
      }
    }));
    const fresh = loaded.filter((p): p is PatientView => p !== null);
    setPatients(fresh);
    // The open detail view holds its own PatientView reference; re-point it at
    // the refreshed data or it keeps showing pre-reload sessions and plans.
    setSelected(prev => prev ? (fresh.find(p => p.user._id === prev.user._id) ?? null) : null);
  }

  const startCv = async (clientId: string, testId: TestId): Promise<void> => {
    try {
      const grant = await sessionApi.requestCvGrant({ clientId, testId });
      setActiveCv({ clientId, testId, token: grant.token });
    } catch (err) {
      alert(`Could not start the test: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const handleCvComplete = async (outcome: TestOutcomeWire, outcomeToken?: string): Promise<void> => {
    if (!activeCv) return;
    if (outcome.terminated_early) {
      alert("Test stopped early - nothing was saved. Run the test again when the client is ready.");
      setActiveCv(null);
      return;
    }
    if (!outcomeToken) {
      alert("This result could not be verified by the assessment service, so it was not saved. Please run the test again.");
      setActiveCv(null);
      return;
    }
    // The signed token is the whole payload: the score inside it and the
    // clinical verdict derived from it are both settled server-side.
    const saved = await sessionApi.save({ cvOutcomeToken: outcomeToken });
    setResult(saved);
    setActiveCv(null);
  };

  const dismissResult = async (): Promise<void> => {
    setResult(null);
    await loadPatients();
  };

  const handleOverride = async (sessionId: string, reason: string, next: number): Promise<void> => {
    await sessionApi.override(sessionId, reason, next);
    await loadPatients();
  };

  const handleDeleteSession = async (sessionId: string, reason: string): Promise<void> => {
    await sessionApi.delete(sessionId, reason);
    await loadPatients();
  };

  // `selected` holds its own PatientView reference, so a schedule change has to
  // move both or the open detail view keeps rendering the pre-change list.
  const patchSchedule = (clientId: string, next: (entries: ScheduleEntry[]) => ScheduleEntry[]): void => {
    const apply = (p: PatientView): PatientView =>
      p.user._id === clientId ? { ...p, schedule: next(p.schedule) } : p;
    setPatients(prev => prev.map(apply));
    setSelected(prev => prev ? apply(prev) : null);
  };

  // Splice the one row rather than calling loadPatients(): a full reload
  // re-fetches every patient's sessions and plans to show a single booking.
  const handleBook = async (clientId: string, testId: TestId, date: string, time: string): Promise<void> => {
    const entry = await scheduleApi.book({ clientId, testId, date, time });
    patchSchedule(clientId, entries => [...entries, entry].sort(byDateTime));
  };

  const handleCancelBooking = async (clientId: string, entryId: string): Promise<void> => {
    await scheduleApi.cancel(entryId);
    patchSchedule(clientId, entries => entries.filter(e => e._id !== entryId));
  };

  const handleSavePlan = async (clientId: string, items: InterventionPlanItem[]): Promise<void> => {
    const plan = await planApi.save({ clientId, authoredBy: user._id, items });
    setPatients(prev => prev.map(p => p.user._id === clientId ? { ...p, plan } : p));
  };

  if (activeCv) {
    return (
      <TestRunner
        testId={activeCv.testId}
        token={activeCv.token}
        onComplete={handleCvComplete}
        onBack={() => setActiveCv(null)}
      />
    );
  }

  if (result) {
    return <AssessmentResult session={result} onDone={() => void dismissResult()} />;
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
          <div className="text-base font-semibold text-gray-900">{greetWord}, Dr {firstNameOf(user.name)}</div>
          <div className="text-xs text-gray-400">You have {patients.length} assigned patients</div>
        </div>
      )}
    >
      {tab === "overview"    && !selected && <Overview      patients={patients} onOpen={p => { setSelected(p); setTab("patients"); }} />}
      {tab === "patients"    && !selected && <PatientList   patients={patients} search={search} onSearch={setSearch} onOpen={setSelected} />}
      {tab === "patients"    && selected  && (
        <PatientDetail
          patient={selected}
          onOverride={handleOverride}
          onDelete={handleDeleteSession}
          onBook={handleBook}
          onCancelBooking={handleCancelBooking}
        />
      )}
      {tab === "assessments" && (
        <Assessments
          patients={patients}
          onLaunchCV={(clientId, testId) => void startCv(clientId, testId)}
        />
      )}
      {tab === "plans"       && <Plans       patients={patients} onSave={handleSavePlan} />}
    </SidebarLayout>
  );
}
