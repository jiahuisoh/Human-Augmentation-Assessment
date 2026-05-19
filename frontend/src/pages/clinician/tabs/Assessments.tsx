// ================================================================
// Clinician > Assessments tab.
// ================================================================
// Two responsibilities, separated visually:
//
//   1. PENDING VIDEO REVIEWS — telehealth queue.
//      Client uploaded a video from Self-Report → clinician scores
//      and approves/rejects. On approve, the system creates the
//      formal AssessmentSession and awards tokens (handled by the
//      mock/REST submissionApi.approve atomically).
//
//   2. LIVE CV LAUNCH — clinic-administered tests.
//      Clinician selects an assigned patient + test → opens
//      TestRunner. On complete, a session is saved + tokens awarded
//      (handled in ClinicianIndex.handleCvComplete).
// ================================================================

import { useState } from "react";
import { Camera, ClipboardList, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { TESTS } from "../../../utils/constants";
import RiskBadge from "../../../components/RiskBadge";
import { riskFromSessions, type PatientView } from "../ClinicianShared";
import type { TestId, VideoSubmission } from "../../../types";

interface AssessmentsProps {
  patients: PatientView[];
  submissions: VideoSubmission[];
  onLaunchCV: (clientId: string, testId: TestId) => void;
  onApproveSubmission: (
    sub: VideoSubmission,
    overrides: { reps?: number; measurement?: number; classification?: string; notes?: string },
  ) => Promise<void>;
  onRejectSubmission: (sub: VideoSubmission, notes: string) => Promise<void>;
}

export default function Assessments({
  patients, submissions, onLaunchCV, onApproveSubmission, onRejectSubmission,
}: AssessmentsProps) {
  return (
    <div className="space-y-5">
      <ReviewQueue
        submissions={submissions} patients={patients}
        onApprove={onApproveSubmission} onReject={onRejectSubmission}
      />
      <LiveLaunch patients={patients} onLaunchCV={onLaunchCV} />
    </div>
  );
}

// ---- Review queue ------------------------------------------------

interface ReviewQueueProps {
  submissions: VideoSubmission[];
  patients: PatientView[];
  onApprove: AssessmentsProps["onApproveSubmission"];
  onReject:  AssessmentsProps["onRejectSubmission"];
}

function ReviewQueue({ submissions, patients, onApprove, onReject }: ReviewQueueProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <ClipboardList size={15} className="text-violet-600" />
        Pending video reviews
        {submissions.length > 0 && (
          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {submissions.length}
          </span>
        )}
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Client-submitted videos awaiting your review. On approval, the system records the formal
        assessment session and awards tokens to the client.
      </p>
      {submissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          No pending video submissions from your assigned patients.
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => {
            const patient = patients.find(p => p.user._id === sub.clientId);
            return (
              <SubmissionCard key={sub._id}
                submission={sub} patientName={patient?.user.name ?? sub.clientId}
                onApprove={onApprove} onReject={onReject}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SubmissionCardProps {
  submission: VideoSubmission;
  patientName: string;
  onApprove: AssessmentsProps["onApproveSubmission"];
  onReject:  AssessmentsProps["onRejectSubmission"];
}

function SubmissionCard({ submission, patientName, onApprove, onReject }: SubmissionCardProps) {
  const test = TESTS.find(t => t.id === submission.testId);
  const [mode, setMode]               = useState<"idle" | "approving" | "rejecting">("idle");
  const [score, setScore]             = useState("");
  const [classification, setCls]      = useState("");
  const [notes, setNotes]             = useState("");
  const [busy, setBusy]               = useState(false);

  // Use the right field name based on the test (reps vs cm).
  const scoreFieldLabel = submission.testId === "chair_stand" ? "Reps (count)" : "Measurement (cm)";
  const scoreToOverride = (raw: string): { reps?: number; measurement?: number } => {
    const n = Number(raw);
    if (!raw || Number.isNaN(n)) return {};
    return submission.testId === "chair_stand" ? { reps: n } : { measurement: n };
  };

  const approve = async (): Promise<void> => {
    setBusy(true);
    try {
      await onApprove(submission, { ...scoreToOverride(score), classification: classification || undefined, notes: notes || undefined });
      setMode("idle"); setScore(""); setCls(""); setNotes("");
    } finally { setBusy(false); }
  };

  const reject = async (): Promise<void> => {
    if (!notes.trim()) return;
    setBusy(true);
    try {
      await onReject(submission, notes);
      setMode("idle"); setNotes("");
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
          <Camera size={18} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{patientName}</div>
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            {test && <test.Icon size={12} className="text-violet-500" />}
            <span>{test?.name} · {submission.fileName} · {(submission.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Submitted {new Date(submission.submittedAt).toLocaleDateString("en-SG")}
          </div>
        </div>
        <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
          Awaiting review
        </span>
      </div>

      {/* Mock video placeholder — real backend would serve a signed URL */}
      <div className="mt-3 bg-slate-100 border border-slate-200 rounded-lg p-4 text-center">
        <Camera size={20} className="text-slate-400 mx-auto mb-1" />
        <p className="text-xs text-slate-500">
          Video preview placeholder — in production this would stream from off-chain storage
          (<span className="font-mono">{submission.storageRef ?? "—"}</span>)
        </p>
      </div>

      {mode === "idle" && (
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => setMode("approving")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">
            <CheckCircle size={13} /> Approve & score
          </button>
          <button type="button" onClick={() => setMode("rejecting")}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors">
            <XCircle size={13} /> Reject
          </button>
        </div>
      )}

      {mode === "approving" && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
          <div className="text-xs text-gray-600 flex items-start gap-1.5">
            <AlertCircle size={11} className="text-gray-400 flex-shrink-0 mt-0.5" />
            Leave the score field blank to use auto-synthesised values from the CV pipeline.
            All approvals are logged with your clinician ID.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={score} onChange={e => setScore(e.target.value)} type="number"
              placeholder={scoreFieldLabel}
              className="px-2 py-1.5 border border-gray-200 rounded text-xs" />
            <input value={classification} onChange={e => setCls(e.target.value)}
              placeholder="Classification (optional)"
              className="px-2 py-1.5 border border-gray-200 rounded text-xs" />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Reviewer notes (optional)"
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs resize-none" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void approve()}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
              {busy ? "…" : "Confirm approval"}
            </button>
            <button type="button" onClick={() => setMode("idle")}
              className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "rejecting" && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Reason for rejection (required) — e.g. video quality, posture not visible…"
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs resize-none" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !notes.trim()} onClick={() => void reject()}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
              {busy ? "…" : "Confirm rejection"}
            </button>
            <button type="button" onClick={() => setMode("idle")}
              className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Live CV launch ----------------------------------------------

interface LiveLaunchProps {
  patients: PatientView[];
  onLaunchCV: (clientId: string, testId: TestId) => void;
}

function LiveLaunch({ patients, onLaunchCV }: LiveLaunchProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Camera size={15} className="text-violet-600" /> Conduct a live assessment
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        For in-clinic sessions. Frames stream privately to the HANA CV service; sessions are recorded with timestamp and liveness score.
      </p>
      <div className="space-y-3">
        {patients.map(p => (
          <div key={p.user._id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-900">{p.user.name}</div>
              <RiskBadge level={riskFromSessions(p.sessions)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TESTS.map(t => (
                <button key={t.id} type="button" onClick={() => onLaunchCV(p.user._id, t.id)}
                  className={cls(
                    "text-left bg-violet-50 hover:bg-violet-100 transition-colors rounded-lg p-3 border border-violet-100",
                  )}>
                  <t.Icon size={18} className="text-violet-600 mb-1.5" />
                  <div className="text-xs font-semibold text-violet-700">{t.name}</div>
                  <div className="text-xs text-violet-500 flex items-center gap-1 mt-1"><Camera size={10} /> Launch CV</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
