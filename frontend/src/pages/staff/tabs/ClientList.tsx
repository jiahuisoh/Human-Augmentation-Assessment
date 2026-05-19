import { Search } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { ScheduleEntry } from "../../../types";

interface ClientListProps {
  schedule: ScheduleEntry[];
  search: string;
  onSearch: (v: string) => void;
}

export default function ClientList({ schedule, search, onSearch }: ClientListProps) {
  const filtered = schedule.filter(s => s.clientName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Search clients…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-teal-500 focus:outline-none" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Name", "Programme", "NRIC Status", "Schedule"].map(h => (
              <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s => (
              <tr key={s._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.clientName}</td>
                <td className="px-4 py-3 text-gray-500">Active Ageing Programme</td>
                <td className="px-4 py-3">
                  <span className={cls("px-2 py-0.5 rounded-full text-xs font-semibold",
                    s.nricVerified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
                  )}>
                    {s.nricVerified ? "Verified" : "Not verified"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{s.time} today</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        Staff view is limited to scheduling and operational data. Full client health records are accessible to assigned clinicians only.
      </div>
    </div>
  );
}
