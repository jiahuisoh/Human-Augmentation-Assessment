import { useState } from "react";
import { Plus, Trash2, UserX, UserCheck, X, Check } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { auditApi, userApi } from "../../../utils/api";
import type { Role, Sex, User, VerificationStatus } from "../../../types";

interface UsersProps {
  users: User[];
  actor: User;
  onChange: () => Promise<void>;
}

export default function Users_({ users, actor, onChange }: UsersProps) {
  const [assigningClient, setAssigningClient] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const blankForm = { name: "", email: "", password: "", role: "clinician" as Role, dateOfBirth: "", gender: "other" as Sex, height: "", weight: "" };
  const [form, setForm] = useState(blankForm);

  const clinicians = users.filter(u => u.role === "clinician");
  const clients    = users.filter(u => u.role === "client");

  const ROLE_GROUPS: ReadonlyArray<{ role: Role; label: string; text: string; bg: string; }> = [
    { role: "client",        label: "Clients",        text: "text-blue-700",   bg: "bg-blue-50"  },
    { role: "staff",         label: "Staff",          text: "text-teal-700",   bg: "bg-teal-50" },
    { role: "clinician",     label: "Clinicians",     text: "text-violet-700", bg: "bg-violet-50" },
    { role: "developer",     label: "Developers",     text: "text-amber-700",  bg: "bg-amber-50" },
    { role: "administrator", label: "Administrators", text: "text-indigo-700", bg: "bg-indigo-50" },
  ];
  const managed = users.filter(u => u._id !== actor._id);

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

  const submitCreate = async (): Promise<void> => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setCreateErr("Name, email and password are required.");
      return;
    }
    setBusy(true);
    setCreateErr("");
    try {
      await userApi.create({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        role: form.role,
        dateOfBirth: form.role === "client" ? form.dateOfBirth : "",
        gender: form.role === "client" ? form.gender : "other",
        height: form.role === "client" ? (Number(form.height) || 0) : 0,
        weight: form.role === "client" ? (Number(form.weight) || 0) : 0,
      });
      await auditApi.write({
        actorId: actor._id, actorRole: "administrator", category: "ADMIN", level: "INFO",
        message: `Created ${form.role} Account: ${form.email.trim()}`,
      }).catch(() => undefined);
      await onChange();
      setCreating(false);
      setForm(blankForm);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center">
        <button type="button"
          onClick={() => { setCreateErr(""); setForm(blankForm); setCreating(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus size={13} /> New Account
        </button>
      </div>

      {ROLE_GROUPS.map(({ role, label, text, bg }) => {
        const group = managed.filter(u => u.role === role);
        if (group.length === 0) return null;
        return (
          <div key={role} className={cls("bg-white border border-gray-200 border-l-4 rounded-xl overflow-hidden", bg)}>
            <div className={cls("flex items-center gap-2 px-4 py-2.5 border-b border-gray-200", bg)}>
              <span className={cls("text-sm font-semibold", text)}>{label}</span>
              <span className="text-xs text-gray-400">· {group.length} Account{group.length !== 1 ? "s" : ""}</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{["Name", "Email", "Verification", ""].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.map(u => (
                  <tr key={u._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <select value={u.verificationStatus} onChange={e => void setStatus(u, e.target.value as VerificationStatus)}
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800">
                        {(["unverified", "pending", "verified", "suspended"] as const).map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {u.role === "client" && (
                          <button type="button" title="Assign to clinician"
                            onClick={() => setAssigningClient(u)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold transition-colors">
                            <UserCheck size={12} /> Assign
                          </button>
                        )}
                        <button type="button" title="Suspend" onClick={() => void suspend(u)}
                          className="p-1 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors">
                          <UserX size={13} />
                        </button>
                        <button type="button" title="Delete" onClick={() => void remove(u)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Assign modal */}
      {assigningClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Assign clinician</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Client: <span className="text-gray-900 font-medium">{assigningClient.name}</span>
                </p>
              </div>
              <button type="button" onClick={() => setAssigningClient(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>

            {clinicians.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No clinician accounts found.</p>
            ) : (
              <div className="space-y-2">
                {clinicians.map(cl => {
                  const assigned = (cl.assignedClientIds ?? []).includes(assigningClient._id);
                  return (
                    <div key={cl._id}
                      className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{cl.name}</div>
                        <div className="text-xs text-gray-500">{cl.email}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {(cl.assignedClientIds ?? []).length} client(s) assigned
                        </div>
                      </div>
                      <button type="button" disabled={busy}
                        onClick={() => void toggleAssignment(cl, assigningClient._id, assigned)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          assigned
                            ? "bg-green-100 hover:bg-red-100 text-green-700 hover:text-red-700"
                            : "bg-gray-100 hover:bg-violet-100 text-gray-700 hover:text-violet-700"
                        }`}>
                        {assigned ? <><Check size={11} /> Assigned</> : <>+ Assign</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Assigned clinicians will see this client in their patient list.
                All assignments are audit-logged.
              </p>
              <button type="button" onClick={() => setAssigningClient(null)}
                className="mt-3 w-full py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">New Account</h3>
              <button type="button" onClick={() => setCreating(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email" type="email"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
              <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Password" type="password"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-indigo-500 focus:outline-none">
                {(["client", "staff", "clinician", "developer", "administrator"] as const).map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {form.role === "client" && (
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                    type="date" title="Date of birth"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
                  <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value as Sex }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-indigo-500 focus:outline-none">
                    {(["male", "female", "other"] as const).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                    placeholder="Height (cm)" type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
                  <input value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                    placeholder="Weight (kg)" type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
              )}
            </div>

            {createErr && <p className="mt-3 text-xs text-red-600">{createErr}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void submitCreate()}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                {busy ? "Creating…" : "Create Account"}
              </button>
              <button type="button" onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
