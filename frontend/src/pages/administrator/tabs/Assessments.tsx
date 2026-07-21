import { useEffect, useState } from "react";
import { Trash2, RefreshCw } from "lucide-react";
import { sessionApi } from "../../../utils/api";
import { TESTS } from "../../../utils/constants";
import { cls } from "../../../utils/helpers";
import type { AssessmentSession, User } from "../../../types";

interface AssessmentsProps {
  users: User[];
}

// The score an administrator sees: the latest override if one exists, else the
// base result. Mirrors PatientDetail so the two views never disagree.
const effectiveScore = (s: AssessmentSession): number | null => {
  const last = s.overrides?.[s.overrides.length - 1];
  if (last) return last.newScore;
  return s.reps ?? s.measurement ?? null;
};

export default function Assessments({ users }: AssessmentsProps) {
  const clients = users.filter(u => u.role === "client");
  const [clientId, setClientId]   = useState("");
  const [sessions, setSessions]   = useState<AssessmentSession[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadErr, setLoadErr]     = useState("");

  const [deleting, setDeleting]         = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteErr, setDeleteErr]       = useState("");
  const [busy, setBusy]                 = useState(false);

  useEffect(() => {
    if (!clientId) { setSessions([]); return; }
    void load(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function load(id: string): Promise<void> {
    setLoading(true);
    setLoadErr("");
    try {
      setSessions(await sessionApi.listForClient(id));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load assessments.");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  const startDelete = (sessionId: string): void => {
    setDeleting(sessionId); setDeleteReason(""); setDeleteErr("");
  };

  const confirmDelete = async (sessionId: string): Promise<void> => {
    setBusy(true);
    setDeleteErr("");
    try {
      await sessionApi.delete(sessionId, deleteReason);
      setDeleting(null); setDeleteReason("");
      await load(clientId);
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "Failed to delete the assessment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label htmlFor="adm-client" className="block text-sm font-semibold text-gray-900 mb-2">
          Client
        </label>
        <div className="flex gap-2">
          <select
            id="adm-client"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select a client…</option>
            {clients.map(c => (
              <option key={c._id} value={c._id}>{c.name} · {c.email}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!clientId || loading}
            onClick={() => void load(clientId)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cls(loading && "animate-spin")} /> Refresh
          </button>
        </div>
        {clients.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">No client accounts exist yet.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          Assessment sessions{sessions.length > 0 ? ` (${sessions.length})` : ""}
        </h4>

        {loadErr && <p className="text-xs font-medium text-red-600">{loadErr}</p>}
        {!clientId && !loadErr && (
          <p className="text-xs text-gray-400">Select a client to view their recorded assessments.</p>
        )}
        {clientId && !loading && !loadErr && sessions.length === 0 && (
          <p className="text-xs text-gray-400">This client has no recorded assessments.</p>
        )}

        {sessions.map(s => {
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
                    {new Date(s.createdAt).toLocaleString("en-SG")}
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

              {deleting === s._id ? (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="mb-2 text-xs font-semibold text-red-800">
                    Permanently delete this assessment?
                  </p>
                  <p className="mb-2 text-xs text-red-700">
                    The record is removed from the database and cannot be recovered. The reason
                    and a copy of the score are kept in the audit log.
                  </p>
                  <label htmlFor={`adm-del-${s._id}`} className="block text-xs font-medium text-gray-600 mb-1">
                    Reason for Deletion (required for audit)
                  </label>
                  <textarea
                    id={`adm-del-${s._id}`}
                    value={deleteReason}
                    onChange={e => setDeleteReason(e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded text-xs focus:border-red-500 focus:outline-none resize-none"
                  />
                  {deleteErr && <p className="mb-2 text-xs font-medium text-red-600">{deleteErr}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !deleteReason.trim()}
                      onClick={() => void confirmDelete(s._id)}
                      className="px-3 py-1.5 bg-red-600 disabled:opacity-50 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"
                    >
                      {busy ? "Deleting…" : "Delete Permanently"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(null)}
                      className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startDelete(s._id)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800 font-medium"
                >
                  <Trash2 size={11} /> Delete assessment
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
