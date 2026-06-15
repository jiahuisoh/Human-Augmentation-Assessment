import { Users, AlertTriangle, Activity } from "lucide-react";
import { cls } from "../../../utils/helpers";
import RiskBadge from "../../../components/RiskBadge";
import { adherenceOf, riskFromSessions, type PatientView } from "../ClinicianShared";

interface OverviewProps {
  patients: PatientView[];
  onOpen: (p: PatientView) => void;
}

export default function Overview({ patients, onOpen }: OverviewProps) {
  const high = patients.filter(p => riskFromSessions(p.sessions) === "high").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {([
          [String(patients.length), "Assigned patients",  Users,         "text-violet-600",  "bg-violet-50"],
          [String(high),            "High risk",           AlertTriangle, "text-red-600",     "bg-red-50"],
          ["8",                     "Sessions this week",  Activity,      "text-emerald-600", "bg-emerald-50"],
        ] as const).map(([v, l, Icon, col, bg]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={cls("w-9 h-9 rounded-lg flex items-center justify-center mb-3", bg)}><Icon size={18} className={col} /></div>
            <div className="text-2xl font-bold text-gray-900 leading-none mb-0.5">{v}</div>
            <div className="text-xs text-gray-500">{l}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Patients needing attention</h3>
        {patients
          .filter(p => riskFromSessions(p.sessions) === "high" || adherenceOf(p.plan) < 50)
          .map(p => (
            <div key={p.user._id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <div className="text-sm font-medium text-gray-900">{p.user.name}</div>
                <div className="text-xs text-gray-400">Adherence: {adherenceOf(p.plan)}%</div>
              </div>
              <div className="flex items-center gap-2">
                <RiskBadge level={riskFromSessions(p.sessions)} />
                <button type="button" onClick={() => onOpen(p)} className="text-violet-600 hover:text-violet-800 text-xs font-medium">
                  View
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
