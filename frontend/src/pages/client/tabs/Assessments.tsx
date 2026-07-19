import { Eye } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { labelForTest } from "../ClientShared";
import type { AssessmentSession } from "../../../types";

interface AssessmentsProps {
  sessions: AssessmentSession[];
}

export default function Assessments({ sessions }: AssessmentsProps) {
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
        <h3 className="text-base font-semibold text-gray-900 mb-1">Past results</h3>
        <p className="text-xs text-gray-400 mb-4">Approved assessments your clinician has signed off on. Simplified view - full clinical data is managed by your clinician.</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No assessments yet. Your clinician will record results during your clinic visits.</p>
        ) : sessions.slice(0, 8).map(s => (
          <div key={s._id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
            <div>
              <div className="text-sm font-medium text-gray-900">{labelForTest(s.testId)}</div>
              <div className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString("en-SG")}</div>
            </div>
            <span className={cls("px-3 py-1 rounded-full text-xs font-semibold",
              s.riskLevel === "low"      ? "bg-green-50 text-green-700"
              : s.riskLevel === "moderate" ? "bg-amber-50 text-amber-700"
              : s.riskLevel === "high"     ? "bg-red-50 text-red-700"
              : "bg-gray-50 text-gray-700",
            )}>
              {s.classification ?? "Recorded"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
