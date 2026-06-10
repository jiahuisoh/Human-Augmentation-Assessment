import { Eye, Sparkles } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { labelForTest } from "../ClientShared";
import type { AIRecommendation, AssessmentSession } from "../../../types";

interface AssessmentsProps {
  sessions: AssessmentSession[];
  aiInsights: AIRecommendation[];
}

export default function Assessments({ sessions, aiInsights }: AssessmentsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-800 flex items-start gap-2">
        <Eye size={15} className="text-violet-500 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          All assessment results are conducted and reviewed by a clinician during your
          clinic visits. Your latest signed-off results appear below.
        </p>
      </div>

      {aiInsights.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-violet-500" />
            <h3 className="text-base font-semibold text-gray-900">AI insights</h3>
          </div>
          <p className="text-xs text-gray-400 mb-4">Personalised suggestions from your clinician-reviewed AI analysis.</p>
          <div className="space-y-3">
            {aiInsights.map(r => (
              <div key={r._id} className="bg-violet-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-violet-900 mb-1">{r.title}</p>
                <p className="text-sm text-violet-800 leading-relaxed">{r.detail}</p>
                <p className="text-xs text-violet-400 mt-2">
                  {new Date(r.createdAt).toLocaleDateString("en-SG")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Past results</h3>
        <p className="text-xs text-gray-400 mb-4">Approved assessments your clinician has signed off on. Simplified view — full clinical data is managed by your clinician.</p>
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
