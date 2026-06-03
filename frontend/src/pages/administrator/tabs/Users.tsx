import { useState } from "react";
import { Plus, Trash2, UserX, UserCheck, X, Check } from "lucide-react";
import RoleBadge from "../../../components/RoleBadge";
import { auditApi, userApi } from "../../../utils/api";
import type { User, VerificationStatus } from "../../../types";

interface UsersProps {
  users: User[];
  actor: User;
  onChange: () => Promise<void>;
}

export default function Users_({ users, actor, onChange }: UsersProps) {
  const [assigningClient, setAssigningClient] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const clinicians = users.filter(u => u.role === "clinician");
  const clients    = users.filter(u => u.role === "client");

  const setStatus = async (u: User, status: VerificationStatus): Promise<void> => {
    await userApi.setStatus(u._id, status);
    await auditApi.write({
      actorId: actor._id, actorRole: "administrator", category: "ADMIN", level: "INFO",
      message: `User ${u._id} status set to ${status}`,
    });
    await onChange();
  };

  const suspend = async (u: User): Promise<void> => {
    await userApi.setStatus(u._id, "suspended");
    await auditApi.write({
      actorId: actor._id, actorRole: "administrator", category: "ADMIN", level: "WARN",
      message: `User ${u._id} suspended`,
    });
    await onChange();
  };

  const remove = async (u: User): Promise<void> => {
    if (!confirm("Delete user permanently?")) return;
    await userApi.delete(u._id);
    await auditApi.write({
      actorId: actor._id, actorRole: "administrator", category: "ADMIN", level: "ERROR",
      message: `User ${u._id} deleted`,
    });
    await onChange();
  };

  const toggleAssignment = async (clinician: User, clientId: string, currentlyAssigned: boolean): Promise<void> => {
    setBusy(true);
    try {
      await userApi.assignClient(clinician._id, clientId, !currentlyAssigned);
      await auditApi.write({
        actorId: actor._id, actorRole: "administrator", category: "ADMIN", level: "INFO",
        message: `Client ${clientId} ${!currentlyAssigned ? "assigned to" : "unassigned from"} clinician ${clinician._id}`,
      });
      await onChange();
      // keep modal open but re-sync the client reference from the refreshed users list
      setAssigningClient(prev => prev ? (users.find(u => u._id === prev._id) ?? prev) : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-400">{users.length} accounts across all roles</span>
        <button type="button"
          className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus size={13} /> New account
        </button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-700">
            <tr>{["Name", "Email", "Role", "Verification", ""].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            {users.map(u => (
              <tr key={u._id} className="hover:bg-slate-900/50">
                <td className="px-4 py-3 font-medium text-slate-200">{u.name}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3">
                  <select value={u.verificationStatus} onChange={e => void setStatus(u, e.target.value as VerificationStatus)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
                    {(["unverified", "pending", "verified", "suspended"] as const).map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 items-center">
                    {u.role === "client" && (
                      <button type="button" title="Assign to clinician"
                        onClick={() => setAssigningClient(u)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-violet-800 hover:bg-violet-700 text-violet-200 text-xs font-semibold transition-colors">
                        <UserCheck size={12} /> Assign
                      </button>
                    )}
                    <button type="button" title="Suspend" onClick={() => void suspend(u)}
                      className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-amber-300 transition-colors">
                      <UserX size={13} />
                    </button>
                    <button type="button" title="Delete" onClick={() => void remove(u)}
                      className="p-1 rounded hover:bg-red-900/40 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign modal */}
      {assigningClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Assign clinician</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Client: <span className="text-slate-200 font-medium">{assigningClient.name}</span>
                </p>
              </div>
              <button type="button" onClick={() => setAssigningClient(null)}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            {clinicians.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No clinician accounts found.</p>
            ) : (
              <div className="space-y-2">
                {clinicians.map(cl => {
                  const assigned = (cl.assignedClientIds ?? []).includes(assigningClient._id);
                  return (
                    <div key={cl._id}
                      className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-700">
                      <div>
                        <div className="text-sm font-medium text-slate-200">{cl.name}</div>
                        <div className="text-xs text-slate-500">{cl.email}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {(cl.assignedClientIds ?? []).length} client(s) assigned
                        </div>
                      </div>
                      <button type="button" disabled={busy}
                        onClick={() => void toggleAssignment(cl, assigningClient._id, assigned)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          assigned
                            ? "bg-green-800 hover:bg-red-900 text-green-200 hover:text-red-200"
                            : "bg-slate-700 hover:bg-violet-700 text-slate-300 hover:text-violet-100"
                        }`}>
                        {assigned ? <><Check size={11} /> Assigned</> : <>+ Assign</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500">
                Assigned clinicians will see this client in their patient list and video review queue.
                All assignments are audit-logged.
              </p>
              <button type="button" onClick={() => setAssigningClient(null)}
                className="mt-3 w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
