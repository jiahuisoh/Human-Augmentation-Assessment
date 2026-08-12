import { ChevronRight, Eye } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { labelForTest } from "../ClientShared";
import type { AssessmentSession } from "../../../types";

interface AssessmentsProps {
  sessions: AssessmentSession[];
  onOpen: (session: AssessmentSession) => void;
}

const RISK_STYLE: Record<string, string> = {
  low:      "bg-green-50 text-green-700",
  moderate: "bg-amber-50 text-amber-700",
  high:     "bg-red-50 text-red-700",
};

export default function Assessments({ sessions, onOpen }: AssessmentsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-800 flex items-start gap-2">
        <Eye size={15} className="text-violet-500 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Results you record at home appear here for your reference. Your clinician reviews
          and confirms assessments during your clinic visits.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Assessment Result History</h3>
        <p className="text-xs text-gray-400 mb-4">
          Tap any assessment result to see the full breakdown again, exactly as it appeared when you finished the test.
        </p>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">
            No assessments yet. Take one from the Assessment tab, or your clinician will record results during your clinic visits.
          </p>
        ) : sessions.map(s => (
          <button key={s._id} type="button" onClick={() => onOpen(s)}
            className="w-full flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-0 text-left rounded-lg hover:bg-gray-50 transition-colors">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">{labelForTest(s.testId)}</div>
              <div className="text-xs text-gray-400">
                {new Date(s.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cls(
                "px-3 py-1 rounded-full text-xs font-semibold",
                RISK_STYLE[s.riskLevel ?? ""] ?? "bg-gray-50 text-gray-700",
              )}>
                {s.classification ?? "Recorded"}
              </span>
              <ChevronRight size={15} className="text-gray-300" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
