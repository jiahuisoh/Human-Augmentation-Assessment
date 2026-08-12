import type { ScheduleEntry } from "../../../types";

interface AttendanceProps {
  schedule: ScheduleEntry[];
  onMark: (id: string, present: boolean) => Promise<void>;
}

export default function Attendance({ schedule, onMark }: AttendanceProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Record Session Attendance</h3>
      <p className="text-xs text-gray-400 mb-4">
        Attendance only. Clinical notes and assessment results are managed by the assigned clinician.
      </p>
      {schedule.length === 0 && (
        <p className="text-sm text-gray-400">No sessions are booked for today.</p>
      )}
      {schedule.map(s => {
        const isDone = s.status === "present" || s.status === "absent";
        return (
          <div key={s._id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div>
              <div className="text-sm font-medium text-gray-900">{s.clientName}</div>
              <div className="text-xs text-gray-400">{s.time} · {s.testId.replace(/_/g, " ")}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void onMark(s._id, true)} disabled={isDone}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                Present
              </button>
              <button type="button" onClick={() => void onMark(s._id, false)} disabled={isDone}
                className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Absent
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
