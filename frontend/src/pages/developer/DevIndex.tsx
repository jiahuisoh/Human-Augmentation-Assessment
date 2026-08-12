import { useEffect, useState } from "react";
import {
  Terminal, AlertTriangle, Camera, Activity,
} from "lucide-react";
import { auditApi, sessionApi } from "../../utils/api";
import SidebarLayout, { type NavItem } from "../../components/SidebarLayout";
import TestRunner from "../../cv/TestRunner";
import type { AuditLog, TestId, User } from "../../types";

import CvSandboxLauncher from "../../components/CvSandboxLauncher";
import { runHealthChecks, type HealthReport } from "./DeveloperShared";
import SystemHealth from "./tabs/SystemHealth";
import Logs       from "./tabs/Logs";

type TabId = "health" | "cv_sandbox" | "logs";

const TABS: ReadonlyArray<NavItem & { id: TabId }> = [
  { id: "health",     label: "System Health",   Icon: Activity },
  { id: "cv_sandbox", label: "CV Sandbox",      Icon: Camera   },
  { id: "logs",       label: "Tech Logs",       Icon: Terminal },
];

interface DeveloperProps {
  user: User;
  onSignOut: () => void;
}

export default function Developer({ user, onSignOut }: DeveloperProps) {
  const [tab, setTab]             = useState<TabId>("health");
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [logsErr, setLogsErr]     = useState("");
  const [logsBusy, setLogsBusy]   = useState(false);
  const [cvTest, setCvTest]       = useState<{ testId: TestId; token: string } | null>(null);
  const [health, setHealth]       = useState<HealthReport | null>(null);
  const [checking, setChecking]   = useState(false);

  useEffect(() => {
    void refreshLogs();
    void refreshHealth();
  }, []);

  const refreshHealth = async (): Promise<void> => {
    setChecking(true);
    try {
      setHealth(await runHealthChecks());
    } finally {
      setChecking(false);
    }
  };


  const refreshLogs = async (): Promise<void> => {
    setLogsBusy(true);
    try {
      setLogs(await auditApi.list(100));
      setLogsErr("");
    } catch (err) {
      setLogsErr(err instanceof Error ? err.message : "Could not load the technical logs.");
    } finally {
      setLogsBusy(false);
    }
  };

  // Sandbox grants carry a synthetic subject and are marked sandbox: true, so
  // the backend refuses to save any result produced under one.
  const startSandbox = async (testId: TestId): Promise<void> => {
    try {
      const grant = await sessionApi.requestCvGrant({ testId, sandbox: true });
      setCvTest({ testId, token: grant.token });
    } catch (err) {
      alert(`Could not start the sandbox test: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };


  const handleCvComplete = async (): Promise<void> => {
    setCvTest(null);
    // A completed run is itself evidence about the pipeline, so refresh both.
    await Promise.all([refreshLogs(), refreshHealth()]);
  };

  if (cvTest) {
    return (
      <TestRunner
        testId={cvTest.testId}
        token={cvTest.token}
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
          <div className="text-xs text-gray-400">Sandbox Environment - No Live Patient Data</div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-xs text-amber-700">
          <AlertTriangle size={14} className="flex-shrink-0" />
          Developer Access is restricted to Sandbox Environments. No Identifiable Patient Data is Accessible. All actions are logged.
        </div>

        {tab === "health"     && (
          <SystemHealth
            report={health} checking={checking}
            onRefresh={() => void refreshHealth()}
          />
        )}
        {tab === "cv_sandbox" && <CvSandboxLauncher onLaunch={testId => void startSandbox(testId)} />}
        {tab === "logs"       && (
          <Logs
            logs={logs} error={logsErr} busy={logsBusy}
            onRefresh={() => void refreshLogs()}
          />
        )}
      </div>
    </SidebarLayout>
  );
}
