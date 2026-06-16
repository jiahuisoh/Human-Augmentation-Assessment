import { useState } from "react";
import { Edit3 } from "lucide-react";
import { TESTS } from "../../../utils/constants";
import { adherenceOf, riskFromSessions, type PatientView } from "../ClinicianShared";

interface PatientDetailProps {
  patient: PatientView;
  onOverride: (sessionId: string, reason: string, originalScore: number, newScore: number) => Promise<void>;
}

export default function PatientDetail({ patient, onOverride }: PatientDetailProps) {
  const [overriding, setOverriding] = useState<string | null>(null);
  const [reason, setReason]         = useState("");
  const [newScore, setNewScore]     = useState("");

  return (
    <div className="space-y-4">
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

        <h4 className="text-sm font-semibold text-gray-900 mb-3">Assessment sessions (full clinical data)</h4>
        {patient.sessions.map(s => (
          <div key={s._id} className="py-3 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {TESTS.find(t => t.id === s.testId)?.name ?? s.testId}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(s.createdAt).toLocaleDateString("en-SG")} ·
                  liveness {Math.round((s.livenessScore ?? 0) * 100)}%
                  {s.overrides && s.overrides.length > 0 ? ` · ${s.overrides.length} override(s)` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">
                  {s.reps != null ? `${s.reps} reps`
                    : s.measurement != null ? `${s.measurement} cm`
                    : "—"}
                </div>
                <div className="text-xs text-gray-400">{s.classification ?? ""}</div>
              </div>
            </div>

            {overriding === s._id ? (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <input value={newScore} onChange={e => setNewScore(e.target.value)} placeholder="New score" type="number"
                  className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded text-sm focus:border-violet-500 focus:outline-none" />
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  placeholder="Reason for override (required for audit)…"
                  className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded text-xs focus:border-violet-500 focus:outline-none resize-none" />
                <div className="flex gap-2">
                  <button type="button"
                    disabled={!reason.trim() || !newScore}
                    onClick={async () => {
                      const original = s.reps ?? s.measurement ?? 0;
                      await onOverride(s._id, reason, original, Number(newScore));
                      setOverriding(null); setReason(""); setNewScore("");
                    }}
                    className="px-3 py-1.5 bg-amber-600 disabled:opacity-50 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg">
                    Confirm override
                  </button>
                  <button type="button" onClick={() => setOverriding(null)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setOverriding(s._id)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-800 font-medium">
                <Edit3 size={11} /> Override score (audit trail)
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
