import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Terminal,
  Settings, ClipboardList, Camera,
} from "lucide-react";
import { firstNameOf } from "../../utils/helpers";
import {
  auditApi, sessionApi, userApi,
} from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import CvSandboxLauncher from "../../components/CvSandboxLauncher";
import TestRunner from "../../cv/TestRunner";
import type {
  AuditLog, TestId, User,
} from "../../types";

import Overview    from "./tabs/Overview";
import Users_      from "./tabs/Users";
import Assessments from "./tabs/Assessments";
import Audit       from "./tabs/Audit";
import Config      from "./tabs/Config";

type TabId =
  | "overview" | "users" | "assessments"
  | "audit" | "config" | "cv_sandbox";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "overview",    label: "Overview",        Icon: LayoutDashboard },
  { id: "users",       label: "User Management", Icon: Users           },
  { id: "assessments", label: "Assessments",     Icon: ClipboardList   },
  { id: "audit",       label: "Audit Trail",     Icon: Terminal        },
  { id: "config",      label: "Configuration",   Icon: Settings        },
  { id: "cv_sandbox",  label: "CV Sandbox",      Icon: Camera          },
];

interface AdministratorProps {
  user: User;
  onSignOut: () => void;
}

export default function Administrator({ user, onSignOut }: AdministratorProps) {
  const [tab, setTab]               = useState<TabId>("overview");
  const [users, setUsers]           = useState<User[]>([]);
  const [logs, setLogs]             = useState<AuditLog[]>([]);
  const [cvTest, setCvTest]         = useState<{ testId: TestId; token: string } | null>(null);

  useEffect(() => { void refresh(); }, []);

  async function refresh(): Promise<void> {
    const [u, l] = await Promise.all([
      userApi.list(), auditApi.list(200),
    ]);
    setUsers(u); setLogs(l);
  }

  // A system check, not an assessment: the grant carries a synthetic subject and
  // is signed sandbox: true, so the backend refuses to save whatever it produces
  // against any client record.
  const startSandbox = async (testId: TestId): Promise<void> => {
    try {
      const grant = await sessionApi.requestCvGrant({ testId, sandbox: true });
      setCvTest({ testId, token: grant.token });
    } catch (err) {
      alert(`Could not start the sandbox test: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  // Leave the runner before refreshing: TestRunner calls onComplete without
  // awaiting it, so anything that throws first would strand the console here.
  const finishSandbox = (): void => {
    setCvTest(null);
    void refresh().catch(() => {});
  };

  if (cvTest) {
    return (
      <TestRunner
        testId={cvTest.testId}
        token={cvTest.token}
        sandbox
        onComplete={finishSandbox}
        onBack={() => setCvTest(null)}
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
            {users.length} User Account{users.length !== 1 ? "s" : ""}
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
        {tab === "cv_sandbox" && <CvSandboxLauncher onLaunch={testId => void startSandbox(testId)} />}
      </div>
    </SidebarLayout>
  );
}
