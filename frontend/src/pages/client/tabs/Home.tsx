import {
  ClipboardList, TrendingUp, ChevronRight,
  Activity, Shield, Lock,
} from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { AssessmentSession, User } from "../../../types";

interface HomeProps {
  user: User;
  sessions: AssessmentSession[];
  onStart: () => void;
  onNavigate: (tab: string) => void;
}

export default function Home({ user, sessions, onStart, onNavigate }: HomeProps) {
  const latest = sessions[0];
  const latestValue = latest?.riskLevel ? latest.riskLevel.toUpperCase() : "-";
  const latestSub = latest
    ? (latest.classification ?? new Date(latest.createdAt).toLocaleDateString("en-SG"))
    : "no assessments yet";
  return (
    <>
      {user.verificationStatus === "unverified" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Lock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Account pending verification</p>
            <p className="text-xs text-amber-700 mt-0.5">Visit your clinic to complete identity verification.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {([
          [String(sessions.length), "Assessments",   "recorded",         ClipboardList, "text-violet-600",  "bg-violet-50"],
          [latestValue,             "Latest result", latestSub,          TrendingUp,    "text-emerald-600", "bg-emerald-50"],
        ] as const).map(([v, l, s, Icon, col, bg]) => (
          <div key={l} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className={cls("w-9 h-9 rounded-xl flex items-center justify-center mb-2", bg)}><Icon size={18} className={col} /></div>
            <div className="text-2xl font-bold text-gray-900">{v}</div>
            <div className="text-sm font-semibold text-gray-700">{l}</div>
            <div className="text-xs text-gray-400">{s}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Quick actions</div>
        {([
          ["Start today's assessment",   ClipboardList, "text-violet-600",  "bg-violet-50",  onStart],
          ["View my intervention plan",  Activity,    "text-emerald-600", "bg-emerald-50", () => onNavigate("plan")],
          ["How my data is used",       Shield,      "text-blue-600",    "bg-blue-50",    () => onNavigate("records")],
        ] as const).map(([label, Icon, col, bg, action]) => (
          <button key={label} type="button" onClick={action}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
            <div className={cls("w-8 h-8 rounded-lg flex items-center justify-center", bg)}><Icon size={15} className={col} /></div>
            <span className="text-sm text-gray-800 flex-1 text-left">{label}</span>
            <ChevronRight size={15} className="text-gray-400" />
          </button>
        ))}
      </div>
    </>
  );
}
