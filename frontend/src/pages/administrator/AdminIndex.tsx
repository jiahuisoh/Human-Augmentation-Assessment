import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Terminal,
  Settings, Camera, ClipboardList,
} from "lucide-react";
import { firstNameOf } from "../../utils/helpers";
import {
  auditApi, scheduleApi, sessionApi, userApi,
} from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import TestRunner from "../../cv/TestRunner";
import AssessmentResult from "../../cv/AssessmentResult";
import type { TestOutcomeWire } from "../../cv/wireTypes";
import type {
  AssessmentSession, AuditLog, ScheduleEntry, TestId, User,
} from "../../types";

import Overview    from "./tabs/Overview";
import Users_      from "./tabs/Users";
import Assessments from "./tabs/Assessments";
import Audit       from "./tabs/Audit";
import Config      from "./tabs/Config";
import Cv          from "./tabs/Cv";

type TabId =
  | "overview" | "users" | "assessments"
  | "audit" | "config" | "cv";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "overview",    label: "Overview",        Icon: LayoutDashboard },
  { id: "users",       label: "User Management", Icon: Users           },
  { id: "assessments", label: "Assessments",     Icon: ClipboardList   },
  { id: "audit",       label: "Audit Trail",     Icon: Terminal        },
  { id: "config",      label: "Configuration",   Icon: Settings        },
  { id: "cv",          label: "CV (Authorised)", Icon: Camera          },
];

interface AdministratorProps {
  user: User;
  onSignOut: () => void;
}

export default function Administrator({ user, onSignOut }: AdministratorProps) {
  const [tab, setTab]               = useState<TabId>("overview");
  const [users, setUsers]           = useState<User[]>([]);
  const [logs, setLogs]             = useState<AuditLog[]>([]);
  const [schedule, setSchedule]     = useState<ScheduleEntry[]>([]);

  const [cvAuthorised, setCvAuthorised] = useState(false);
  const [activeCv, setActiveCv]         = useState<{ clientId: string; testId: TestId; token: string } | null>(null);
  const [result,   setResult]           = useState<AssessmentSession | null>(null);

  useEffect(() => { void refresh(); }, []);

  async function refresh(): Promise<void> {
    const [u, l, s] = await Promise.all([
      userApi.list(), auditApi.list(200), scheduleApi.listToday(),
    ]);
    setUsers(u); setLogs(l); setSchedule(s);
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
    const saved = await sessionApi.save({ cvOutcomeToken: outcomeToken });
    setResult(saved);
    setActiveCv(null);
  };

  if (result) {
    return <AssessmentResult session={result} onDone={() => setResult(null)} />;
  }

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

  return (
    <SidebarLayout
      user={user} tabs={TABS} activeTab={tab}
      onTab={id => setTab(id as TabId)}
      onSignOut={onSignOut} accent="indigo"
      headerLeft={
        <div>
          <div className="text-base font-semibold text-gray-900">
            Welcome, {firstNameOf(user.name)}
          </div>
          <div className="text-xs text-gray-400">
            {users.length} user account{users.length !== 1 ? "s" : ""}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {tab === "overview"  && <Overview  users={users} />}
        {tab === "users"     && <Users_    users={users} actor={user} onChange={refresh} />}
        {tab === "assessments" && <Assessments users={users} />}
        {tab === "audit"     && <Audit     logs={logs} />}
        {tab === "config"    && <Config />}
        {tab === "cv"        && <Cv        schedule={schedule} authorised={cvAuthorised} onAuthorise={setCvAuthorised} onLaunch={(clientId, testId) => void startCv(clientId, testId)} />}
      </div>
    </SidebarLayout>
  );
}
