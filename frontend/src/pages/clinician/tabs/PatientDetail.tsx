import { useState } from "react";
import { Edit3, Trash2 } from "lucide-react";
import { ClientProfile } from "../../../components/ClientProfile";
import { TESTS } from "../../../utils/constants";
import { adherenceOf, riskFromSessions, type PatientView } from "../ClinicianShared";
import ScheduleCard from "../components/ScheduleCard";
import type { AssessmentSession, TestId } from "../../../types";

interface PatientDetailProps {
  patient: PatientView;
  onOverride: (sessionId: string, reason: string, newScore: number) => Promise<void>;
  onDelete: (sessionId: string, reason: string) => Promise<void>;
  onBook: (clientId: string, testId: TestId, date: string, time: string) => Promise<void>;
  onCancelBooking: (clientId: string, entryId: string) => Promise<void>;
}

// The score a clinician acts on - and the one the backend records as the
// override's "before" value: the latest override if any, else the base result.
const effectiveScore = (s: AssessmentSession): number | null => {
  const last = s.overrides?.[s.overrides.length - 1];
  if (last) return last.newScore;
  return s.reps ?? s.measurement ?? null;
};

export default function PatientDetail({
  patient, onOverride, onDelete, onBook, onCancelBooking,
}: PatientDetailProps) {
  const [overriding, setOverriding]   = useState<string | null>(null);
  const [reason, setReason]           = useState("");
  const [newScore, setNewScore]       = useState("");
  const [overrideErr, setOverrideErr] = useState("");
  const [busy, setBusy]               = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteErr, setDeleteErr]     = useState("");

  const startOverride = (sessionId: string): void => {
    setOverriding(sessionId); setDeleting(null); setReason(""); setNewScore(""); setOverrideErr("");
  };

  const startDelete = (sessionId: string): void => {
    setDeleting(sessionId); setOverriding(null); setDeleteReason(""); setDeleteErr("");
  };

  const confirmDelete = async (sessionId: string): Promise<void> => {
    setBusy(true);
    setDeleteErr("");
    try {
      await onDelete(sessionId, deleteReason);
      setDeleting(null); setDeleteReason("");
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "Failed to delete the assessment.");
    } finally {
      setBusy(false);
    }
  };

  const confirmOverride = async (sessionId: string): Promise<void> => {
    setBusy(true);
    setOverrideErr("");
    try {
      await onOverride(sessionId, reason, Number(newScore));
      setOverriding(null); setReason(""); setNewScore("");
    } catch (e) {
      setOverrideErr(e instanceof Error ? e.message : "Failed to save the override.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Client profile</h4>
        <ClientProfile user={patient.user} />
      </div>

      <ScheduleCard
        entries={patient.schedule}
        onBook={(testId, date, time) => onBook(patient.user._id, testId, date, time)}
        onCancel={entryId => onCancelBooking(patient.user._id, entryId)}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {([
            ["Adherence",     `${adherenceOf(patient.plan)}%`],
            ["Risk level",    riskFromSessions(patient.sessions)],
          ] as const).map(([l, v]) => (
            <div key={l} className="text-center bg-gray-50 rounded-lg p-3">
              <div className="text-xl font-bold text-gray-900 capitalize">{v}</div>
              <div className="text-xs text-gray-500">{l}</div>
            </div>
          ))}
        </div>

        <h4 className="text-sm font-semibold text-gray-900 mb-3">Assessment Sessions (Full Clinical Data)</h4>
        {patient.sessions.map(s => {
          const overridden = (s.overrides?.length ?? 0) > 0;
          const score = effectiveScore(s);
          const unit = s.testId === "chair_stand" ? "reps" : "cm";
          return (
          <div key={s._id} className="py-3 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {TESTS.find(t => t.id === s.testId)?.name ?? s.testId}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(s.createdAt).toLocaleDateString("en-SG")}
                  {overridden ? ` · ${s.overrides!.length} override(s)` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">
                  {score != null ? `${score} ${unit}` : "-"}
                  {overridden && <span className="ml-1 text-xs font-semibold text-amber-600">(overridden)</span>}
                </div>
                <div className="text-xs text-gray-400">{s.classification ?? ""}</div>
              </div>
            </div>

            {overriding === s._id ? (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label htmlFor="ov-score" className="block text-xs font-medium text-gray-600 mb-1">New Score</label>
                <input id="ov-score" value={newScore} onChange={e => setNewScore(e.target.value)} type="number"
                  className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded text-sm focus:border-violet-500 focus:outline-none" />
                <label htmlFor="ov-reason" className="block text-xs font-medium text-gray-600 mb-1">Override Reason (Required for Audit)</label>
                <textarea id="ov-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded text-xs focus:border-violet-500 focus:outline-none resize-none" />
                {overrideErr && <p className="mb-2 text-xs font-medium text-red-600">{overrideErr}</p>}
                <div className="flex gap-2">
                  <button type="button"
                    disabled={busy || !reason.trim() || !newScore}
                    onClick={() => void confirmOverride(s._id)}
                    className="px-3 py-1.5 bg-amber-600 disabled:opacity-50 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg">
                    {busy ? "Saving…" : "Confirm Override"}
                  </button>
                  <button type="button" onClick={() => setOverriding(null)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : deleting === s._id ? (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="mb-2 text-xs font-semibold text-red-800">
                  Permanently delete this assessment?
                </p>
                <p className="mb-2 text-xs text-red-700">
                  The record is removed from the database and cannot be recovered. The reason
                  and a copy of the score are kept in the audit log.
                </p>
                <label htmlFor="del-reason" className="block text-xs font-medium text-gray-600 mb-1">
                  Reason for Deletion (required for audit)
                </label>
                <textarea id="del-reason" value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={2}
                  className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded text-xs focus:border-red-500 focus:outline-none resize-none" />
                {deleteErr && <p className="mb-2 text-xs font-medium text-red-600">{deleteErr}</p>}
                <div className="flex gap-2">
                  <button type="button"
                    disabled={busy || !deleteReason.trim()}
                    onClick={() => void confirmDelete(s._id)}
                    className="px-3 py-1.5 bg-red-600 disabled:opacity-50 hover:bg-red-700 text-white text-xs font-semibold rounded-lg">
                    {busy ? "Deleting…" : "Delete Permanently"}
                  </button>
                  <button type="button" onClick={() => setDeleting(null)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-4">
                <button type="button" onClick={() => startOverride(s._id)}
                  className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-800 font-medium">
                  <Edit3 size={11} /> Override Score (Audit)
                </button>
                <button type="button" onClick={() => startDelete(s._id)}
                  className="inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800 font-medium">
                  <Trash2 size={11} /> Delete Assessment
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
