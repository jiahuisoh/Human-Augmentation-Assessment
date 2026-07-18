import { useState } from "react";
import { Plus, Trash2, UserX, UserCheck, X, Check, ShieldCheck, ShieldAlert } from "lucide-react";
import { cls, isValidNric } from "../../../utils/helpers";
import { userApi } from "../../../utils/api";
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
  const [actionErr, setActionErr] = useState("");
  const blankForm = { name: "", email: "", password: "", role: "clinician" as Role, dateOfBirth: "", gender: "other" as Sex, height: "", weight: "", nric: "" };
  const [form, setForm] = useState(blankForm);

  const clinicians = users.filter(u => u.role === "clinician");
  const clients    = users.filter(u => u.role === "client");

  // See which clinician (by name) an existing client is currently assigned to.
  const clinicianNamesFor = (clientId: string): string[] =>
    clinicians.filter(cl => (cl.assignedClientIds ?? []).includes(clientId)).map(cl => cl.name);

  // Verified clients with no clinician yet; surfaced in the Clients header.
  // Unverified/pending clients cannot be assigned, so they are not counted.
  const unassignedClientCount = clients.filter(
    c => c.verificationStatus === "verified" && clinicianNamesFor(c._id).length === 0,
  ).length;

  const ROLE_GROUPS: ReadonlyArray<{ role: Role; label: string; text: string; bg: string; }> = [
    { role: "client",        label: "Clients",        text: "text-blue-700",   bg: "bg-blue-50"  },
    { role: "staff",         label: "Staff",          text: "text-teal-700",   bg: "bg-teal-50" },
    { role: "clinician",     label: "Clinicians",     text: "text-violet-700", bg: "bg-violet-50" },
    { role: "developer",     label: "Developers",     text: "text-amber-700",  bg: "bg-amber-50" },
    { role: "administrator", label: "Administrators", text: "text-indigo-700", bg: "bg-indigo-50" },
  ];
  const managed = users.filter(u => u._id !== actor._id);

  const runAction = async (action: () => Promise<unknown>): Promise<void> => {
    setActionErr("");
    try {
      await action();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "The action could not be completed.");
    } finally {
      await onChange().catch(() =>
        setActionErr("The list could not be refreshed. Please reload the page."));
    }
  };

  const setStatus = (u: User, status: VerificationStatus): Promise<void> =>
    runAction(() => userApi.setStatus(u._id, status));

  const suspend = (u: User): Promise<void> =>
    runAction(() => userApi.setStatus(u._id, "suspended"));

  const remove = async (u: User): Promise<void> => {
    if (!confirm("Delete user permanently?")) return;
    await runAction(() => userApi.delete(u._id));
  };

  const toggleAssignment = async (clinician: User, clientId: string, currentlyAssigned: boolean): Promise<void> => {
    setBusy(true);
    try {
      await runAction(() => userApi.assignClient(clinician._id, clientId, !currentlyAssigned));
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
    if (form.role === "client" && form.nric.trim() && !isValidNric(form.nric)) {
      setCreateErr("Please enter a valid Singapore NRIC or FIN, or leave it blank.");
      return;
    }
    setBusy(true);
    setCreateErr("");
    try {
      const isClient = form.role === "client";
      // Optional fields are omitted (not sent as 0 / "") so backend validation
      // only applies to values that were actually provided.
      await userApi.create({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        role: form.role,
        dateOfBirth: isClient && form.dateOfBirth ? form.dateOfBirth : undefined,
        gender: isClient ? form.gender : undefined,
        height: isClient && form.height ? Number(form.height) : undefined,
        weight: isClient && form.weight ? Number(form.weight) : undefined,
        nric: isClient && form.nric.trim() ? form.nric.trim().toUpperCase() : undefined,
      });
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

      {actionErr && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <p className="text-xs font-medium text-red-700">{actionErr}</p>
          <button type="button" onClick={() => setActionErr("")}
            className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-700 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {ROLE_GROUPS.map(({ role, label, text, bg }) => {
        const group = managed.filter(u => u.role === role);
        if (group.length === 0) return null;
        return (
          <div key={role} className={cls("bg-white border border-gray-200 border-l-4 rounded-xl overflow-hidden", bg)}>
            <div className={cls("flex items-center gap-2 px-4 py-2.5 border-b border-gray-200", bg)}>
              <span className={cls("text-sm font-semibold", text)}>{label}</span>
              <span className="text-xs text-gray-400">· {group.length} Account{group.length !== 1 ? "s" : ""}</span>
              {role === "client" && (
                <span className="text-xs">
                  <span className="text-gray-400">· </span>
                  {unassignedClientCount > 0
                    ? <span className="font-semibold text-amber-600">{unassignedClientCount} Unassigned Client{unassignedClientCount !== 1 ? "s" : ""}</span>
                    : <span className="font-semibold text-green-600">All Clients Assigned</span>}
                </span>
              )}
            </div>
            <table className="w-full text-xs table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{([
                  ["Name", "w-[28%]"],
                  ["Email", "w-[28%]"],
                  ["Verification", "w-[28%]"],
                  ["", "w-[16%]"],
                ] as const).map(([h, w]) => (
                  <th key={h} className={cls("text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider", w)}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.map(u => {
                  const assignedTo = u.role === "client" ? clinicianNamesFor(u._id) : [];
                  const isAssigned = assignedTo.length > 0;
                  return (
                  <tr key={u._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500 truncate">{u.email}</td>
                    <td className="px-4 py-3">
                      <select value={u.verificationStatus} onChange={e => void setStatus(u, e.target.value as VerificationStatus)}
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800">
                        {(["unverified", "pending", "verified", "suspended"] as const).map(s => <option key={s}>{s}</option>)}
                      </select>
                      {u.verificationStatus === "pending" && u.staffVerification && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {u.staffVerification.recommended ? (
                            <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                              <ShieldCheck size={12} /> Staff: NRIC matched
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-semibold text-red-700">
                              <ShieldAlert size={12} /> Staff: NRIC did NOT match
                            </span>
                          )}
                          <button type="button" onClick={() => void setStatus(u, "verified")}
                            className="px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
                            Approve
                          </button>
                          <button type="button" onClick={() => void setStatus(u, "unverified")}
                            className="px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold transition-colors">
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {u.role === "client" && u.verificationStatus === "verified" && (
                          <button type="button"
                            title={isAssigned ? `Assigned to ${assignedTo.join(", ")}` : "Not Assigned to any clinician: click to assign"}
                            onClick={() => setAssigningClient(u)}
                            className={cls(
                              "flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors",
                              isAssigned
                                ? "bg-green-50 hover:bg-green-100 text-green-700"
                                : "bg-amber-50 hover:bg-amber-100 text-amber-700",
                            )}>
                            {isAssigned ? <><Check size={12} /> Assigned</> : <><UserCheck size={12} /> Assign</>}
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
                  );
                })}
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
                {clinicianNamesFor(assigningClient._id).length > 0 ? (
                  <p className="text-xs mt-1 font-medium text-green-600 flex items-center gap-1">
                    <Check size={12} /> Assigned to {clinicianNamesFor(assigningClient._id).join(", ")}
                  </p>
                ) : (
                  <p className="text-xs mt-1 font-medium text-amber-600">Not Assigned</p>
                )}
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
                          {(cl.assignedClientIds ?? []).filter(id => clients.some(c => c._id === id)).length} client(s) assigned
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
              <div>
                <label htmlFor="na-name" className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                <input id="na-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label htmlFor="na-email" className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input id="na-email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  type="email"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label htmlFor="na-password" className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                <input id="na-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  type="password"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label htmlFor="na-role" className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                <select id="na-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-indigo-500 focus:outline-none">
                  {(["client", "staff", "clinician", "developer", "administrator"] as const).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {form.role === "client" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="na-dob" className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                    <input id="na-dob" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                      type="date"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
                  </div>
                  <div>
                    <label htmlFor="na-gender" className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                    <select id="na-gender" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value as Sex }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-indigo-500 focus:outline-none">
                      {(["male", "female", "other"] as const).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="na-height" className="block text-xs font-medium text-gray-500 mb-1">Height (cm)</label>
                    <input id="na-height" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                      type="number"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
                  </div>
                  <div>
                    <label htmlFor="na-weight" className="block text-xs font-medium text-gray-500 mb-1">Weight (kg)</label>
                    <input id="na-weight" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                      type="number"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="na-nric" className="block text-xs font-medium text-gray-500 mb-1">NRIC (optional, for verification)</label>
                    <input id="na-nric" value={form.nric} onChange={e => setForm(f => ({ ...f, nric: e.target.value.toUpperCase().slice(0, 9) }))}
                      maxLength={9}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:border-indigo-500 focus:outline-none" />
                  </div>
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
