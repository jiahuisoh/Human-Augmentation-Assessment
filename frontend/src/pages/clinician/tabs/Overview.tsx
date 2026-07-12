import { Users, AlertTriangle, Activity, CheckCircle2, ClipboardList, ChevronRight } from "lucide-react";
import { cls, initialsOf } from "../../../utils/helpers";
import { TESTS } from "../../../utils/constants";
import RiskBadge from "../../../components/RiskBadge";
import { adherenceOf, riskFromSessions, type PatientView } from "../ClinicianShared";
import type { RiskLevel } from "../../../types";

interface OverviewProps {
  patients: PatientView[];
  onOpen: (p: PatientView) => void;
}

const RISK_TINT: Record<RiskLevel, { bg: string; text: string }> = {
  low:      { bg: "bg-emerald-50", text: "text-emerald-700" },
  moderate: { bg: "bg-amber-50",   text: "text-amber-700"   },
  high:     { bg: "bg-red-50",     text: "text-red-700"     },
};

function testName(id: string): string {
  return TESTS.find(t => t.id === id)?.name ?? id.replace(/_/g, " ");
}

function attentionReason(p: PatientView): string {
  if (riskFromSessions(p.sessions) === "high") return "Flagged high risk";
  return `Low adherence · ${adherenceOf(p.plan)}%`;
}

export default function Overview({ patients, onOpen }: OverviewProps) {
  const high = patients.filter(p => riskFromSessions(p.sessions) === "high").length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sessionsThisWeek = patients.reduce(
    (n, p) => n + p.sessions.filter(s => new Date(s.createdAt).getTime() >= weekAgo).length, 0,
  );

  const needsAttention = patients.filter(
    p => riskFromSessions(p.sessions) === "high" || (!!p.plan && p.plan.items.length > 0 && adherenceOf(p.plan) < 50),
  );

  const recent = patients
    .flatMap(p => p.sessions.map(s => ({ s, name: p.user.name, patient: p })))
    .sort((a, b) => new Date(b.s.createdAt).getTime() - new Date(a.s.createdAt).getTime())
    .slice(0, 5);

  const stats = [
    { v: String(patients.length), l: "Assigned patients", sub: "Under your care", Icon: Users, col: "text-violet-600", bg: "bg-violet-50" },
    { v: String(high), l: "High risk", sub: high > 0 ? "Need review" : "None flagged", Icon: AlertTriangle, col: "text-red-600", bg: "bg-red-50" },
    { v: String(sessionsThisWeek), l: "Sessions this week", sub: "Last 7 days", Icon: Activity, col: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ v, l, sub, Icon, col, bg }) => (
          <div key={l} className="bg-white rounded-2xl border border-gray-200/70 p-5 shadow-sm">
            <div className={cls("w-10 h-10 rounded-xl flex items-center justify-center mb-4", bg)}>
              <Icon size={20} className={col} />
            </div>
            <div className="text-3xl font-bold text-gray-900 leading-none">{v}</div>
            <div className="text-sm font-medium text-gray-700 mt-1.5">{l}</div>
            <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Patients needing attention */}
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Patients needing attention</h3>
            <p className="text-xs text-gray-400 mt-0.5">High risk or below-target adherence</p>
          </div>
          {needsAttention.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
              {needsAttention.length}
            </span>
          )}
        </div>

        {needsAttention.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={22} className="text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {patients.length === 0 ? "No patients assigned yet" : "All patients are on track"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {patients.length === 0
                ? "Assigned patients will appear here."
                : "No high-risk or low-adherence patients right now."}
            </p>
          </div>
        ) : (
          needsAttention.map(p => {
            const level = riskFromSessions(p.sessions);
            const tint = RISK_TINT[level];
            return (
              <div key={p.user._id}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/70 transition-colors">
                <div className={cls("w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0", tint.bg, tint.text)}>
                  {initialsOf(p.user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{p.user.name}</div>
                  <div className="text-xs text-gray-400">{attentionReason(p)}</div>
                </div>
                <RiskBadge level={level} />
                <button type="button" onClick={() => onOpen(p)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors">
                  Review <ChevronRight size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Recent assessments */}
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <ClipboardList size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Recent assessments</h3>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No assessments recorded yet.</div>
        ) : (
          recent.map(({ s, name, patient }) => (
            <div key={s._id}
              onClick={() => onOpen(patient)}
              className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/70 transition-colors cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
                <div className="text-xs text-gray-400">
                  {testName(s.testId)} · {new Date(s.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {s.reps != null ? `${s.reps} reps` : s.measurement != null ? `${s.measurement} cm` : "—"}
                </div>
                {s.classification && <div className="text-xs text-gray-400">{s.classification}</div>}
              </div>
              {s.riskLevel && <RiskBadge level={s.riskLevel} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
