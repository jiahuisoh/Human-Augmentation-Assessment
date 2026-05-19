import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Shield, Terminal, Coins,
  Settings, LogOut, ShoppingBag, Camera, type LucideIcon,
} from "lucide-react";
import { cls, initialsOf } from "../../utils/helpers";
import {
  auditApi, contractApi, scheduleApi, sessionApi, tokenApi, userApi,
} from "../../utils/api";
import TestRunner from "../../cv/TestRunner";
import type { TestOutcomeWire } from "../../cv/wireTypes";
import type {
  AuditLog, RedemptionCatalogueItem, ScheduleEntry, SmartContract,
  TestId, TokenTransaction, User,
} from "../../types";

import Overview  from "./tabs/Overview";
import Users_    from "./tabs/Users";
import Tokens    from "./tabs/Tokens";
import Catalogue from "./tabs/Catalogue";
import Records   from "./tabs/Records";
import Audit     from "./tabs/Audit";
import Config    from "./tabs/Config";
import Cv        from "./tabs/Cv";

type TabId =
  | "overview" | "users" | "tokens" | "catalogue"
  | "records"  | "audit" | "config" | "cv";

interface TabDef { id: TabId; label: string; Icon: LucideIcon }

const TABS: ReadonlyArray<TabDef> = [
  { id: "overview",   label: "Overview",        Icon: LayoutDashboard },
  { id: "users",      label: "User management", Icon: Users           },
  { id: "tokens",     label: "Incentives",      Icon: Coins           },
  { id: "catalogue",  label: "Redemption",      Icon: ShoppingBag     },
  { id: "records",    label: "Health records",  Icon: Shield          },
  { id: "audit",      label: "Audit trail",     Icon: Terminal        },
  { id: "config",     label: "Configuration",   Icon: Settings        },
  { id: "cv",         label: "CV (authorised)", Icon: Camera          },
];

interface AdministratorProps {
  user: User;
  onSignOut: () => void;
}

export default function Administrator({ user, onSignOut }: AdministratorProps) {
  const [tab, setTab]               = useState<TabId>("overview");
  const [users, setUsers]           = useState<User[]>([]);
  const [pendingTokens, setPending] = useState<TokenTransaction[]>([]);
  const [logs, setLogs]             = useState<AuditLog[]>([]);
  const [contracts, setContracts]   = useState<SmartContract[]>([]);
  const [catalogue, setCatalogue]   = useState<RedemptionCatalogueItem[]>([]);
  const [schedule, setSchedule]     = useState<ScheduleEntry[]>([]);

  const [cvAuthorised, setCvAuthorised] = useState(false);
  const [activeCv, setActiveCv]         = useState<{ clientId: string; testId: TestId } | null>(null);

  useEffect(() => { void refresh(); }, []);

  async function refresh(): Promise<void> {
    const [u, p, l, c, cat, s] = await Promise.all([
      userApi.list(), tokenApi.pendingApprovals(), auditApi.list(200),
      contractApi.list(), tokenApi.redemptionCatalogue(), scheduleApi.listToday(),
    ]);
    setUsers(u); setPending(p); setLogs(l); setContracts(c); setCatalogue(cat); setSchedule(s);
  }

  const handleApproveToken = async (id: string): Promise<void> => {
    await tokenApi.approve(id, user._id);
    await auditApi.write({ actorId: user._id, actorRole: "administrator", category: "TOKEN", level: "INFO", message: `Administrator approved token transaction ${id}` });
    await refresh();
  };
  const handleRejectToken = async (id: string, reason: string): Promise<void> => {
    await tokenApi.reject(id, user._id, reason);
    await auditApi.write({ actorId: user._id, actorRole: "administrator", category: "TOKEN", level: "WARN", message: `Administrator rejected token transaction ${id} — ${reason}` });
    await refresh();
  };
  const handleApproveContract = async (id: string): Promise<void> => {
    await contractApi.approveDeployment(id, user._id);
    await auditApi.write({ actorId: user._id, actorRole: "administrator", category: "CONTRACT", level: "INFO", message: `Administrator approved smart-contract deployment ${id}` });
    await refresh();
  };

  const handleCvComplete = async (outcome: TestOutcomeWire): Promise<void> => {
    if (!activeCv) return;
    await sessionApi.save({
      clientId: activeCv.clientId, conductedBy: user._id, testId: activeCv.testId,
      reps: outcome.reps, measurement: outcome.measurement,
      classification: outcome.classification, riskLevel: outcome.risk_level,
      interpretation: outcome.interpretation,
      normLow: outcome.norm_low, normHigh: outcome.norm_high,
      terminatedEarly: outcome.terminated_early, livenessScore: outcome.liveness_score,
      recordHash: "0x" + Math.random().toString(16).slice(2, 18),
    });
    await auditApi.write({
      actorId: user._id, actorRole: "administrator", category: "CV", level: "WARN",
      message: `Administrator conducted CV assessment (${activeCv.testId}) under clinical authorisation`,
      context: { clientId: activeCv.clientId, liveness: outcome.liveness_score },
    });
    setActiveCv(null);
  };

  if (activeCv) {
    return (
      <TestRunner
        testId={activeCv.testId}
        userAge={70} userSex="other" userHeight={170}
        onComplete={handleCvComplete}
        onBack={() => setActiveCv(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="bg-slate-900 border-b border-slate-800 px-5 h-12 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-sm font-medium">HANA Platform</span>
          <span className="text-xs text-indigo-400 bg-indigo-950 border border-indigo-900 px-2 py-0.5 rounded">PROD · SG-01</span>
        </div>
        <nav className="flex gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cls(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all",
                tab === id ? "bg-slate-800 text-indigo-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50",
              )}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-xs font-semibold text-indigo-300">
            {initialsOf(user.name)}
          </div>
          <span className="text-xs text-indigo-400 bg-indigo-950 border border-indigo-900 px-2 py-0.5 rounded">ADMINISTRATOR</span>
          <button type="button" onClick={onSignOut} className="text-slate-600 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </header>

      <div className="px-6 py-5 max-w-7xl mx-auto space-y-5">
        {tab === "overview"  && <Overview  users={users} pendingTokens={pendingTokens} contracts={contracts} onApproveToken={handleApproveToken} onRejectToken={handleRejectToken} onApproveContract={handleApproveContract} />}
        {tab === "users"     && <Users_    users={users} actor={user} onChange={refresh} />}
        {tab === "tokens"    && <Tokens    pending={pendingTokens} onApprove={handleApproveToken} onReject={handleRejectToken} />}
        {tab === "catalogue" && <Catalogue items={catalogue} />}
        {tab === "records"   && <Records />}
        {tab === "audit"     && <Audit     logs={logs} />}
        {tab === "config"    && <Config />}
        {tab === "cv"        && <Cv        schedule={schedule} authorised={cvAuthorised} onAuthorise={setCvAuthorised} onLaunch={(clientId, testId) => setActiveCv({ clientId, testId })} />}
      </div>
    </div>
  );
}
