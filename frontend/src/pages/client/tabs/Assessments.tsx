// ================================================================
// Client > Assessments — READ-ONLY.
// ================================================================
// Per HANA CRM doc, clients DO NOT conduct functional assessments
// ("Conduct functional assessments: No" for Client column). This
// tab therefore only:
//   - displays past clinician-conducted or clinician-reviewed results
//   - shows the status of the client's own video submissions
//
// To submit a new test result, the client uses the Self-Report tab,
// which uploads a video for a clinician to review.
// ================================================================

import { Eye, Camera, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { labelForTest } from "../ClientShared";
import type { AssessmentSession, SubmissionStatus, VideoSubmission } from "../../../types";

interface AssessmentsProps {
  sessions: AssessmentSession[];
  submissions: VideoSubmission[];
}

const STATUS_META: Record<SubmissionStatus, { label: string; bg: string; text: string; Icon: typeof Clock }> = {
  pending:   { label: "Awaiting review", bg: "bg-amber-50",   text: "text-amber-700",   Icon: Clock        },
  in_review: { label: "In review",       bg: "bg-blue-50",    text: "text-blue-700",    Icon: Clock        },
  approved:  { label: "Approved",         bg: "bg-green-50",  text: "text-green-700",   Icon: CheckCircle2 },
  rejected:  { label: "Not approved",      bg: "bg-red-50",     text: "text-red-700",      Icon: XCircle      },
};

export default function Assessments({ sessions, submissions }: AssessmentsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-800 flex items-start gap-2">
        <Eye size={15} className="text-violet-500 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          All assessment results are conducted or reviewed by a clinician.
          To submit a new test, record a video at home from the
          <span className="font-semibold"> Video-Assessment </span>
          tab — your clinician will review and confirm the result.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">My submissions</h3>
        <p className="text-xs text-gray-400 mb-4">Videos you've uploaded for clinician review.</p>
        {submissions.length === 0 ? (
          <p className="text-sm text-gray-400">No submissions yet — record one from the Self-Report tab.</p>
        ) : submissions.map(s => {
          const m = STATUS_META[s.status];
          return (
            <div key={s._id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <Camera size={16} className="text-violet-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{labelForTest(s.testId)}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(s.submittedAt).toLocaleDateString("en-SG")} · {(s.fileSize / (1024 * 1024)).toFixed(1)} MB
                  </div>
                  {s.reviewerNotes && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{s.reviewerNotes}"</p>
                  )}
                </div>
              </div>
              <span className={cls("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold", m.bg, m.text)}>
                <m.Icon size={12} /> {m.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Past results</h3>
        <p className="text-xs text-gray-400 mb-4">Approved assessments your clinician has signed off on. Simplified view — full clinical data is managed by your clinician.</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No assessments yet. Submit your first video from the Self-Report tab.</p>
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
