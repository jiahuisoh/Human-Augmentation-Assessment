import { useEffect, useState } from "react";
import {
  Heart, HeartPulse, ClipboardList, Shield, Activity,
  LogOut, User as UserIcon, HelpCircle,
  ListChecks, Camera, Lock,
  ShieldCheck, ShieldAlert, ShieldX, Clock,
  type LucideIcon,
} from "lucide-react";
import { cls } from "../../utils/helpers";
import {
  consentApi, planApi, sessionApi,
} from "../../utils/api";
import VerificationBanner from "../../components/VerificationBanner";
import TestRunner from "../../cv/TestRunner";
import AssessmentResult from "../../cv/AssessmentResult";
import type { TestOutcomeWire } from "../../cv/wireTypes";
import type {
  AssessmentSession, ConsentEvent, ConsentScope, InterventionPlan,
  TestId, User, VerificationStatus,
} from "../../types";
import { latestConsentByScope } from "./ClientShared";

import Home            from "./tabs/Home";
import Assessments     from "./tabs/Assessments";
import SelfTest        from "./tabs/SelfTest";
import Questionnaire   from "./tabs/Questionnaire";
import Plan            from "./tabs/Plan";
import Records         from "./tabs/Records";
import Account         from "./tabs/Account";
import Help            from "./tabs/Help";

type TabId =
  | "home" | "assessments" | "self_test" | "questionnaire"
  | "plan" | "records" | "account" | "help";

const TABS: ReadonlyArray<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "home",             label: "Home",        Icon: Heart         },
  { id: "assessments",      label: "Results",     Icon: ClipboardList },
  { id: "self_test",        label: "Assessment",  Icon: Camera        },
  { id: "questionnaire",    label: "Questionnaire", Icon: ListChecks    },
  { id: "plan",             label: "Plan",        Icon: Activity      },
  { id: "records",          label: "Privacy",     Icon: Shield        },
  { id: "account",          label: "Account",     Icon: UserIcon      },
  { id: "help",             label: "Help",        Icon: HelpCircle    },
];

interface ClientProps {
  user: User;
  onSignOut: () => void;
  onUserUpdate: (user: User) => void;
}

// The save prompt asks to store the result AND to let the responsible clinician
// see it, so both are recorded. Previously only the first was written, and the
// consent log understated what the client had actually been asked.
const CONSENT_ON_SAVE: ReadonlyArray<ConsentScope> = ["assessment_data", "clinician_share"];

// Status line under the account name in the app bar. The full explanation of
// each state lives in VerificationBanner; this is only the standing summary,
// so a client can always see where their account stands without scrolling.
const VERIFICATION: Record<VerificationStatus, { label: string; tone: string; Icon: LucideIcon }> = {
  verified:   { label: "Identity Verified",      tone: "text-emerald-600", Icon: ShieldCheck },
  pending:    { label: "Verification in Review", tone: "text-blue-600",    Icon: Clock       },
  unverified: { label: "Unverified",       tone: "text-amber-600",   Icon: ShieldAlert },
  suspended:  { label: "Account Suspended",      tone: "text-red-600",     Icon: ShieldX     },
};

// Until identity verification completes (staff NRIC check + admin approval),
// clients can only see Home, Account and Help. Mirrors the backend gate
// (requireVerifiedClient) - this is UX, the server enforces it regardless.
const OPEN_TABS: ReadonlySet<TabId> = new Set(["home", "account", "help"]);

export default function Client({ user, onSignOut, onUserUpdate }: ClientProps) {
  const [tab, setTab]               = useState<TabId>("home");
  const isVerified = user.verificationStatus === "verified";
  const verification = VERIFICATION[user.verificationStatus];
  const isLocked = (id: TabId): boolean => !isVerified && !OPEN_TABS.has(id);
  const goTab = (id: TabId): void => { if (!isLocked(id)) setTab(id); };
  const [sessions, setSessions]     = useState<AssessmentSession[]>([]);
  const [consents, setConsents]     = useState<ConsentEvent[]>([]);
  const [plan,     setPlan]         = useState<InterventionPlan | null>(null);
  const [activeCv,     setActiveCv]     = useState<{ testId: TestId; token: string } | null>(null);
  const [result,       setResult]       = useState<AssessmentSession | null>(null);

  useEffect(() => {
    void Promise.all([
      sessionApi.listForClient(user._id),
      consentApi.historyFor(user._id),
      planApi.forClient(user._id),
    ]).then(([s, c, p]) => {
      setSessions(s); setConsents(c); setPlan(p);
    });
  }, [user._id]);

  const startSelfTest = async (testId: TestId): Promise<void> => {
    try {
      const grant = await sessionApi.requestCvGrant({ testId });
      setActiveCv({ testId, token: grant.token });
    } catch (err) {
      alert(`Could not start the test: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const handleSelfTestComplete = async (outcome: TestOutcomeWire, outcomeToken?: string): Promise<void> => {
    if (!activeCv) return;
    if (outcome.terminated_early) {
      alert("Test stopped early - nothing was saved. You can try again whenever you're ready.");
      setActiveCv(null);
      return;
    }
    if (!outcomeToken) {
      alert("This result could not be verified by the assessment service, so it was not saved. Please try again.");
      setActiveCv(null);
      return;
    }
    try {
      // Not `.some(granted)`: consent is append-only, so a client who granted
      // and later withdrew would still match an old grant and never be asked.
      const latest = latestConsentByScope(consents);
      const missing = CONSENT_ON_SAVE.filter(scope => latest.get(scope)?.granted !== true);
      if (missing.length > 0) {
        const agreed = window.confirm(
          "Save this assessment and share it with your clinician?\n\n" +
          "This records your consent to store your assessment data and to let the clinician " +
          "responsible for your care see it. You can withdraw it later through your clinic.",
        );
        if (!agreed) { setActiveCv(null); return; }
        // Only what is actually outstanding, so re-consenting never appends a
        // duplicate grant to the log.
        await Promise.all(missing.map(scope => consentApi.set(user._id, scope, true)));
        setConsents(await consentApi.historyFor(user._id));
      }
      const saved = await sessionApi.save({ cvOutcomeToken: outcomeToken });
      // The list is newest-first, so the saved session belongs at the front.
      // Splicing it in beats re-fetching every past assessment to learn one.
      setSessions(prev => [saved, ...prev]);
      setResult(saved);
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
        token={activeCv.token}
        onComplete={handleSelfTestComplete}
        onBack={() => setActiveCv(null)}
      />
    );
  }

  // Shown both straight after a test and when a past result is opened from
  // Results, so a client sees exactly the same breakdown either way.
  if (result) {
    return <AssessmentResult session={result} onDone={() => setResult(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl w-full mx-auto px-4 py-3 flex items-center gap-3">
          <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <HeartPulse size={18} className="text-white" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold text-gray-900">HANA</div>
            <div className="text-xs text-gray-400">Functional Health Assessment and Intervention</div>
          </div>

          <div className="min-w-0 text-right leading-tight">
            <div className="text-sm font-medium text-gray-900 truncate">{user.name}</div>
            <div className={cls("text-xs inline-flex items-center gap-1", verification.tone)}>
              <verification.Icon size={12} className="flex-shrink-0" />
              {verification.label}
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="flex flex-wrap gap-1 max-w-3xl w-full mx-auto px-4">
          {TABS.map(({ id, label, Icon }) => {
            const locked = isLocked(id);
            return (
              <button key={id} type="button" onClick={() => goTab(id)}
                disabled={locked}
                title={locked ? "Available after your identity is verified" : undefined}
                className={cls(
                  "flex grow shrink-0 items-center justify-center gap-1.5 px-2 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  tab === id
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-gray-500 hover:text-gray-700",
                  locked && "opacity-40 cursor-not-allowed hover:text-gray-500",
                )}>
                {locked ? <Lock size={14} className="flex-shrink-0" /> : <Icon size={14} className="flex-shrink-0" />}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 max-w-3xl w-full mx-auto">
        {user.verificationStatus !== "verified" && <VerificationBanner status={user.verificationStatus} />}

        {tab === "home"             && <Home            user={user} sessions={sessions} onStart={() => goTab("self_test")} onNavigate={(t) => goTab(t as TabId)} />}
        {tab === "assessments"      && <Assessments     sessions={sessions} onOpen={setResult} />}
        {tab === "self_test"        && <SelfTest        onStart={testId => void startSelfTest(testId)} />}
        {tab === "questionnaire"    && <Questionnaire   user={user} />}
        {tab === "plan"             && <Plan            plan={plan} />}
        {tab === "records"          && <Records         consents={consents} />}
        {tab === "account"          && <Account         user={user} onUserUpdate={onUserUpdate} />}
        {tab === "help"             && <Help />}
      </div>

      <button type="button" onClick={onSignOut}
        className="mx-4 mb-6 flex items-center justify-center gap-2 border border-gray-200 rounded-2xl py-3.5 text-gray-500 text-sm font-medium hover:text-red-600 hover:border-red-200 transition-colors">
        <LogOut size={16} /> Sign Out
      </button>
    </div>
  );
}
