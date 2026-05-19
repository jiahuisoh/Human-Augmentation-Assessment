import { Calendar, AlertCircle, CheckCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { STATUS_LABEL, STATUS_STYLE } from "../StaffShared";
import type { ScheduleEntry } from "../../../types";

interface ScheduleProps {
  schedule: ScheduleEntry[];
}

export default function Schedule({ schedule }: ScheduleProps) {
  const completed   = schedule.filter(s => s.status === "completed" || s.status === "present").length;
  const pendingNric = schedule.filter(s => !s.nricVerified).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {([
          [schedule.length, "Today's sessions", Calendar,    "text-teal-600",  "bg-teal-50"],
          [pendingNric,     "Pending NRIC",      AlertCircle, "text-amber-600", "bg-amber-50"],
          [completed,       "Completed",         CheckCircle, "text-green-600", "bg-green-50"],
        ] as const).map(([v, l, Icon, col, bg]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={cls("w-8 h-8 rounded-lg flex items-center justify-center mb-2", bg)}><Icon size={16} className={col} /></div>
            <div className="text-2xl font-bold text-gray-900">{v}</div>
            <div className="text-xs text-gray-500">{l}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Today's client schedule</h3>
          <span className="text-xs text-gray-400">
            {new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Time", "Client", "Assessment", "NRIC", "Status"].map(h => (
              <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedule.map(s => (
              <tr key={s._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-500">{s.time}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{s.clientName}</td>
                <td className="px-4 py-3 text-gray-600">{s.testId.replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  <span className={cls("px-2 py-0.5 rounded-full text-xs font-semibold",
                    s.nricVerified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
                  )}>
                    {s.nricVerified ? "Verified" : "Required"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cls("px-2 py-0.5 rounded-full text-xs font-semibold border", STATUS_STYLE[s.status])}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        Staff access is limited to operational scheduling and attendance. Clinical assessment data, AI insights, and intervention plans are managed by the assigned clinician.
      </div>
    </div>
  );
}
