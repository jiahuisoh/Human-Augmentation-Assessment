import {
  ClipboardList, TrendingUp, ChevronRight,
  Activity, Shield,
} from "lucide-react";
import { cls, firstNameOf, formatLongDate, greeting } from "../../../utils/helpers";
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
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting()}, {firstNameOf(user.name)}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{formatLongDate()}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([
          [String(sessions.length), "Assessments",   "Recorded",         ClipboardList, "text-violet-600",  "bg-violet-50"],
          [latestValue,             "Latest Result", latestSub,          TrendingUp,    "text-emerald-600", "bg-emerald-50"],
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
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Quick Actions</div>
        {([
          ["Start Today's Assessment",   ClipboardList, "text-violet-600",  "bg-violet-50",  onStart],
          ["View my Intervention Plan",  Activity,    "text-emerald-600", "bg-emerald-50", () => onNavigate("plan")],
          ["How my Data is Utilised",       Shield,      "text-blue-600",    "bg-blue-50",    () => onNavigate("records")],
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
