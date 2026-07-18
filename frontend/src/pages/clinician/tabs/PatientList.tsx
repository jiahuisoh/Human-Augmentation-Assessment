import { Search, ChevronRight, Shield } from "lucide-react";
import { cls } from "../../../utils/helpers";
import RiskBadge from "../../../components/RiskBadge";
import { adherenceOf, calcAge, riskFromSessions, type PatientView } from "../ClinicianShared";

interface PatientListProps {
  patients: PatientView[];
  search: string;
  onSearch: (v: string) => void;
  onOpen: (p: PatientView) => void;
}

export default function PatientList({ patients, search, onSearch, onOpen }: PatientListProps) {
  const filtered = patients.filter(p => p.user.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="patient-search" className="block text-xs font-medium text-gray-500 mb-1">Search Patients</label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input id="patient-search" value={search} onChange={e => onSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Patient", "Age", "Risk", "Adherence", ""].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(p => {
              const adherence = adherenceOf(p.plan);
              return (
                <tr key={p.user._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(p)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.user.name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.user.dateOfBirth ? calcAge(p.user.dateOfBirth) : "—"}</td>
                  <td className="px-4 py-3"><RiskBadge level={riskFromSessions(p.sessions)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={cls("h-full rounded-full",
                          adherence >= 70 ? "bg-green-500" : adherence >= 50 ? "bg-amber-500" : "bg-red-500",
                        )} style={{ width: `${adherence}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{adherence}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-violet-600 text-xs font-medium flex items-center gap-1">View <ChevronRight size={12} /></span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-2">
        <Shield size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        Access restricted to your assigned patients only. All access is logged for audit.
      </div>
    </div>
  );
}
