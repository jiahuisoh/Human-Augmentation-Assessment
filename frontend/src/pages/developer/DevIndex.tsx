import { useEffect, useState } from "react";
import {
  Terminal, AlertTriangle, Camera,
} from "lucide-react";
import { auditApi } from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import TestRunner from "../../cv/TestRunner";
import type { AuditLog, TestId, User } from "../../types";

import CVSandbox  from "./tabs/CVSandbox";
import Logs       from "./tabs/Logs";

type TabId = "cv_sandbox" | "logs";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "cv_sandbox", label: "CV Sandbox",      Icon: Camera   },
  { id: "logs",       label: "Tech Logs",       Icon: Terminal },
];

interface DeveloperProps {
  user: User;
  onSignOut: () => void;
}

export default function Developer({ user, onSignOut }: DeveloperProps) {
  const [tab, setTab]             = useState<TabId>("cv_sandbox");
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [cvTest, setCvTest]       = useState<TestId | null>(null);

  useEffect(() => {
    void auditApi.list(100).then(setLogs);
  }, []);

  const handleCvComplete = async (): Promise<void> => {
    setLogs(await auditApi.list(100));
    setCvTest(null);
  };

  if (cvTest) {
    return (
      <TestRunner
        testId={cvTest}
        userAge={70} userSex="other" userHeight={170}
        sandbox
        onComplete={handleCvComplete}
        onBack={() => setCvTest(null)}
      />
    );
  }

  return (
    <SidebarLayout
      user={user} tabs={TABS} activeTab={tab}
      onTab={id => setTab(id as TabId)}
      onSignOut={onSignOut} accent="amber"
      headerLeft={
        <div>
          <div className="text-base font-semibold text-gray-900">Developer Console</div>
          <div className="text-xs text-gray-400">Sandbox environment - no live patient data</div>
        </div>
      }
      headerRight={
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
          <AlertTriangle size={11} /> SANDBOX · DEV
        </div>
      }
    >
      <div className="space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-xs text-amber-700">
          <AlertTriangle size={14} className="flex-shrink-0" />
          Developer access is restricted to sandbox environments only. No identifiable patient data is accessible. All actions are logged.
        </div>

        {tab === "cv_sandbox" && <CVSandbox  onLaunch={setCvTest} />}
        {tab === "logs"       && <Logs       logs={logs} />}
      </div>
    </SidebarLayout>
  );
}
