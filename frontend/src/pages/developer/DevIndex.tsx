import { useEffect, useState } from "react";
import {
  Terminal, Code, Database, Activity, AlertTriangle, LogOut, Camera,
  type LucideIcon,
} from "lucide-react";
import { cls } from "../../utils/helpers";
import { auditApi, contractApi } from "../../utils/api";
import TestRunner from "../../cv/TestRunner";
import type { AuditLog, SmartContract, TestId, User } from "../../types";
import type { TestOutcomeWire } from "../../cv/wireTypes";

import Sandbox    from "./tabs/Sandbox";
import CVSandbox  from "./tabs/CVSandbox";
import Logs       from "./tabs/Logs";
import Contracts  from "./tabs/Contracts";
import Health     from "./tabs/Health";

type TabId = "sandbox" | "cv_sandbox" | "logs" | "contracts" | "health";

interface TabDef { id: TabId; label: string; Icon: LucideIcon }

const TABS: ReadonlyArray<TabDef> = [
  { id: "sandbox",    label: "Token Sandbox",   Icon: Code     },
  { id: "cv_sandbox", label: "CV Sandbox",      Icon: Camera   },
  { id: "logs",       label: "Tech Logs",       Icon: Terminal },
  { id: "contracts",  label: "Smart Contracts", Icon: Database },
  { id: "health",     label: "System Health",   Icon: Activity },
];

interface DeveloperProps {
  user: User;
  onSignOut: () => void;
}

export default function Developer({ user, onSignOut }: DeveloperProps) {
  const [tab, setTab]             = useState<TabId>("sandbox");
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [contracts, setContracts] = useState<SmartContract[]>([]);
  const [cvTest, setCvTest]       = useState<TestId | null>(null);

  useEffect(() => {
    void auditApi.list(100).then(setLogs);
    void contractApi.list().then(setContracts);
  }, []);

  const handleCvComplete = async (outcome: TestOutcomeWire): Promise<void> => {
    await auditApi.write({
      actorId: user._id, actorRole: "developer", category: "CV", level: "INFO",
      message: `Developer CV sandbox run completed (${cvTest})`,
      context: {
        sandbox: true,
        reps: outcome.reps, measurement: outcome.measurement,
        liveness: outcome.liveness_score,
      },
    });
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
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="bg-slate-900 border-b border-slate-800 px-5 h-12 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-violet-500" />
          <span className="text-sm font-medium">HANA Platform</span>
          <span className="text-xs text-amber-400 bg-amber-950 border border-amber-900 px-2 py-0.5 rounded">SANDBOX · DEV</span>
        </div>
        <nav className="flex gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cls(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all",
                tab === id ? "bg-slate-800 text-violet-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50",
              )}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-amber-400 bg-amber-950 border border-amber-900 px-2 py-0.5 rounded">DEVELOPER</span>
          <button type="button" onClick={onSignOut} className="text-slate-600 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </header>

      <div className="px-6 py-5 max-w-5xl mx-auto">
        <div className="bg-amber-950/50 border border-amber-900 rounded-lg p-3 mb-5 flex items-center gap-3 text-xs text-amber-300">
          <AlertTriangle size={14} className="flex-shrink-0" />
          Developer access is restricted to sandbox environments only. No identifiable patient data is accessible. All actions are logged.
        </div>

        {tab === "sandbox"    && <Sandbox    user={user} />}
        {tab === "cv_sandbox" && <CVSandbox  onLaunch={setCvTest} />}
        {tab === "logs"       && <Logs       logs={logs} />}
        {tab === "contracts"  && <Contracts  contracts={contracts} />}
        {tab === "health"     && <Health />}
      </div>
    </div>
  );
}
