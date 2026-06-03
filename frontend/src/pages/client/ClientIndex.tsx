import { useEffect, useState } from "react";
import {
  Heart, Award, ClipboardList, Shield, Activity, TrendingUp,
  CheckCircle, Coins, LogOut, User as UserIcon, HelpCircle, Upload,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { cls, firstNameOf, initialsOf } from "../../utils/helpers";
import { BADGES_DATA } from "../../utils/constants";
import {
  aiApi, consentApi, planApi, sessionApi, submissionApi, tokenApi,
} from "../../utils/api";
import VerificationBanner from "../../components/VerificationBanner";
import type {
  AIRecommendation, AssessmentSession, ConsentEvent, ConsentScope, InterventionPlan,
  RedemptionCatalogueItem, TokenTransaction, User, VideoSubmission,
} from "../../types";
import { greeting } from "./ClientShared";

import Home            from "./tabs/Home";
import Assessments     from "./tabs/Assessments";
import VideoAssessment from "./tabs/VideoAssessment";
import Questionnaire   from "./tabs/Questionnaire";
import Plan            from "./tabs/Plan";
import Activity_       from "./tabs/Activity";
import Badges          from "./tabs/Badges";
import Tokens          from "./tabs/Tokens";
import Records         from "./tabs/Records";
import Account         from "./tabs/Account";
import Help            from "./tabs/Help";

type TabId =
  | "home" | "assessments" | "video_assessment" | "questionnaire"
  | "plan" | "activity" | "badges" | "tokens" | "records" | "account" | "help";

const TABS: ReadonlyArray<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "home",             label: "Home",             Icon: Heart         },
  { id: "assessments",      label: "My Results",       Icon: ClipboardList },
  { id: "video_assessment", label: "Video-Assessment", Icon: Upload        },
  { id: "questionnaire",    label: "Questionnaire",    Icon: ListChecks    },
  { id: "plan",             label: "My Plan",          Icon: Activity      },
  { id: "activity",         label: "Today's Activity", Icon: TrendingUp    },
  { id: "badges",           label: "Achievements",     Icon: Award         },
  { id: "tokens",           label: "Rewards",          Icon: Coins         },
  { id: "records",          label: "My Records",       Icon: Shield        },
  { id: "account",          label: "Account",          Icon: UserIcon      },
  { id: "help",             label: "Help",             Icon: HelpCircle    },
];

interface ClientProps {
  user: User;
  onSignOut: () => void;
}

export default function Client({ user, onSignOut }: ClientProps) {
  const [tab, setTab]               = useState<TabId>("home");
  const [sessions, setSessions]     = useState<AssessmentSession[]>([]);
  const [tokens,   setTokens]       = useState<TokenTransaction[]>([]);
  const [balance,  setBalance]      = useState(0);
  const [consents, setConsents]     = useState<ConsentEvent[]>([]);
  const [plan,     setPlan]         = useState<InterventionPlan | null>(null);
  const [submissions,  setSubmissions]  = useState<VideoSubmission[]>([]);
  const [aiInsights,   setAiInsights]   = useState<AIRecommendation[]>([]);
  const [catalogue,    setCatalogue]    = useState<RedemptionCatalogueItem[]>([]);

  useEffect(() => {
    void Promise.all([
      sessionApi.listForClient(user._id),
      tokenApi.historyFor(user._id),
      tokenApi.balanceFor(user._id),
      consentApi.historyFor(user._id),
      planApi.forClient(user._id),
      submissionApi.listForClient(user._id),
      aiApi.forClient(user._id),
      tokenApi.redemptionCatalogue(),
    ]).then(([s, t, b, c, p, subs, ai, cat]) => {
      setSessions(s); setTokens(t); setBalance(b); setConsents(c); setPlan(p);
      setSubmissions(subs); setAiInsights(ai); setCatalogue(cat);
    });
  }, [user._id]);

  const handleConsentChange = async (scope: ConsentScope, granted: boolean): Promise<void> => {
    await consentApi.set(user._id, scope, granted);
    setConsents(await consentApi.historyFor(user._id));
  };

  const reloadSubmissions = async (): Promise<void> => {
    setSubmissions(await submissionApi.listForClient(user._id));
  };

  const handleRedeem = async (itemId: string): Promise<void> => {
    await tokenApi.redeem(user._id, itemId);
    const [t, b] = await Promise.all([tokenApi.historyFor(user._id), tokenApi.balanceFor(user._id)]);
    setTokens(t);
    setBalance(b);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pt-10 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-violet-200 text-sm">{greeting()}</p>
            <h1 className="text-2xl font-bold text-white">Hi, {firstNameOf(user.name)}!</h1>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-white text-sm">
            {initialsOf(user.name)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 bg-white/10 rounded-2xl p-4">
          {([
            [String(balance),                                  "Health tokens", Coins      ],
            [String(sessions.length),                          "Sessions",      CheckCircle],
            [String(BADGES_DATA.filter(b => b.earned).length), "Badges",        Award      ],
          ] as const).map(([v, l, Icon]) => (
            <div key={l} className="text-center">
              <Icon size={16} className="text-violet-200 mx-auto mb-1" />
              <div className="text-xl font-black text-white">{v}</div>
              <div className="text-xs text-violet-200">{l}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cls(
                "flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                tab === id
                  ? "border-violet-600 text-violet-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 max-w-3xl w-full mx-auto">
        {user.verificationStatus !== "verified" && <VerificationBanner status={user.verificationStatus} />}

        {tab === "home"             && <Home            user={user} sessions={sessions} balance={balance} onStart={() => setTab("video_assessment")} />}
        {tab === "assessments"      && <Assessments     sessions={sessions} submissions={submissions} aiInsights={aiInsights} />}
        {tab === "video_assessment" && <VideoAssessment user={user} submissions={submissions} onChange={reloadSubmissions} />}
        {tab === "questionnaire"    && <Questionnaire   user={user} />}
        {tab === "plan"             && <Plan            plan={plan} />}
        {tab === "activity"         && <Activity_ />}
        {tab === "badges"           && <Badges />}
        {tab === "tokens"           && <Tokens          balance={balance} history={tokens} catalogue={catalogue} onRedeem={handleRedeem} />}
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
