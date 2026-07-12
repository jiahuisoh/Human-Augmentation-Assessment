import { useEffect, useState } from "react";
import {
  Heart, ClipboardList, Shield, Activity, TrendingUp,
  LogOut, User as UserIcon, HelpCircle,
  ListChecks, Camera,
  type LucideIcon,
} from "lucide-react";
import { cls, firstNameOf, initialsOf } from "../../utils/helpers";
import {
  auditApi, consentApi, planApi, sessionApi,
} from "../../utils/api";
import VerificationBanner from "../../components/VerificationBanner";
import TestRunner from "../../cv/TestRunner";
import type { TestOutcomeWire } from "../../cv/wireTypes";
import type {
  AssessmentSession, ConsentEvent, ConsentScope, InterventionPlan,
  TestId, User,
} from "../../types";
import { calcAge, greeting } from "./ClientShared";

import Home            from "./tabs/Home";
import Assessments     from "./tabs/Assessments";
import SelfTest        from "./tabs/SelfTest";
import Questionnaire   from "./tabs/Questionnaire";
import Plan            from "./tabs/Plan";
import Activity_       from "./tabs/Activity";
import Records         from "./tabs/Records";
import Account         from "./tabs/Account";
import Help            from "./tabs/Help";

type TabId =
  | "home" | "assessments" | "self_test" | "questionnaire"
  | "plan" | "activity" | "records" | "account" | "help";

const TABS: ReadonlyArray<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "home",             label: "Home",        Icon: Heart         },
  { id: "assessments",      label: "Results",     Icon: ClipboardList },
  { id: "self_test",        label: "Assessment",  Icon: Camera        },
  { id: "questionnaire",    label: "Questionnaire", Icon: ListChecks    },
  { id: "plan",             label: "Plan",        Icon: Activity      },
  { id: "activity",         label: "Activity",    Icon: TrendingUp    },
  { id: "records",          label: "Records",     Icon: Shield        },
  { id: "account",          label: "Account",     Icon: UserIcon      },
  { id: "help",             label: "Help",        Icon: HelpCircle    },
];

interface ClientProps {
  user: User;
  onSignOut: () => void;
}

export default function Client({ user, onSignOut }: ClientProps) {
  const [tab, setTab]               = useState<TabId>("home");
  const [sessions, setSessions]     = useState<AssessmentSession[]>([]);
  const [consents, setConsents]     = useState<ConsentEvent[]>([]);
  const [plan,     setPlan]         = useState<InterventionPlan | null>(null);
  const [activeCv,     setActiveCv]     = useState<{ testId: TestId } | null>(null);

  useEffect(() => {
    void Promise.all([
      sessionApi.listForClient(user._id),
      consentApi.historyFor(user._id),
      planApi.forClient(user._id),
    ]).then(([s, c, p]) => {
      setSessions(s); setConsents(c); setPlan(p);
    });
  }, [user._id]);

  const handleConsentChange = async (scope: ConsentScope, granted: boolean): Promise<void> => {
    await consentApi.set(user._id, scope, granted);
    setConsents(await consentApi.historyFor(user._id));
  };

  const handleSelfTestComplete = async (outcome: TestOutcomeWire): Promise<void> => {
    if (!activeCv) return;
    try {
      const hasConsent = consents.some(c => c.scope === "assessment_data" && c.granted);
      if (!hasConsent) {
        const agreed = window.confirm(
          "Save this assessment and share it with your clinician?\n\n" +
          "This records your consent to store your assessment data. You can withdraw it later under Records.",
        );
        if (!agreed) return;
        await consentApi.set(user._id, "assessment_data", true);
        setConsents(await consentApi.historyFor(user._id));
      }
      const saved = await sessionApi.save({
        clientId: user._id, conductedBy: user._id, testId: activeCv.testId,
        reps: outcome.reps, measurement: outcome.measurement,
        classification: outcome.classification, riskLevel: outcome.risk_level,
        interpretation: outcome.interpretation,
        normLow: outcome.norm_low, normHigh: outcome.norm_high,
        terminatedEarly: outcome.terminated_early,
      });
      await auditApi.write({
        actorId: user._id, actorRole: "client", category: "CV", level: "INFO",
        message: `Client self-administered ${activeCv.testId} at home`,
        context: { sessionId: saved._id, selfAdministered: true },
      });
      setSessions(await sessionApi.listForClient(user._id));
    } catch (err) {
      alert(`Could not save your result: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setActiveCv(null);
    }
  };

  if (activeCv) {
    return (
      <TestRunner
        testId={activeCv.testId}
        userAge={calcAge(user.dateOfBirth)}
        userSex={user.gender ?? "other"}
        userHeight={user.height ?? null}
        onComplete={handleSelfTestComplete}
        onBack={() => setActiveCv(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pt-10 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-violet-200 text-sm">{greeting()}</p>
            <h1 className="text-2xl font-bold text-white">Hi, {firstNameOf(user.name)}!</h1>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-white text-sm">
            {initialsOf(user.name)}
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cls(
                "flex flex-1 min-w-0 items-center justify-center gap-1.5 px-2 py-3.5 text-sm font-medium border-b-2 transition-colors",
                tab === id
                  ? "border-violet-600 text-violet-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}>
              <Icon size={14} className="flex-shrink-0" /> <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 max-w-3xl w-full mx-auto">
        {user.verificationStatus !== "verified" && <VerificationBanner status={user.verificationStatus} />}

        {tab === "home"             && <Home            user={user} sessions={sessions} onStart={() => setTab("self_test")} onNavigate={(t) => setTab(t as TabId)} />}
        {tab === "assessments"      && <Assessments     sessions={sessions} />}
        {tab === "self_test"        && <SelfTest        onStart={testId => setActiveCv({ testId })} />}
        {tab === "questionnaire"    && <Questionnaire   user={user} />}
        {tab === "plan"             && <Plan            plan={plan} />}
        {tab === "activity"         && <Activity_ />}
        {tab === "records"          && <Records         user={user} consents={consents} sessions={sessions} onConsentChange={handleConsentChange} />}
        {tab === "account"          && <Account         user={user} />}
        {tab === "help"             && <Help />}
      </div>

      <button type="button" onClick={onSignOut}
        className="mx-4 mb-6 flex items-center justify-center gap-2 border border-gray-200 rounded-2xl py-3.5 text-gray-500 text-sm font-medium hover:text-red-600 hover:border-red-200 transition-colors">
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}
