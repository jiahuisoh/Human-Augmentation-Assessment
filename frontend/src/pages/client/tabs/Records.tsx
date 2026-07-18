import { labelForTest } from "../ClientShared";
import type { AssessmentSession } from "../../../types";

interface RecordsProps {
  sessions: AssessmentSession[];
}

export default function Records({ sessions }: RecordsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-2">My records</h3>
        <p className="text-xs text-gray-400 mb-4">Your most recent assessment results.</p>
        {sessions.length === 0 && (
          <p className="text-sm text-gray-400">No assessments recorded yet.</p>
        )}
        {sessions.slice(0, 5).map(s => (
          <div key={s._id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div className="text-sm text-gray-800">{labelForTest(s.testId)} · {new Date(s.createdAt).toLocaleDateString("en-SG")}</div>
            <span className="bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full text-xs font-semibold">Recorded</span>
          </div>
        ))}
      </div>
    </div>
  );
}
