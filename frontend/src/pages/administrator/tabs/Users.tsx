import { Plus, Trash2, UserX } from "lucide-react";
import RoleBadge from "../../../components/RoleBadge";
import { auditApi, userApi } from "../../../utils/api";
import type { User, VerificationStatus } from "../../../types";

interface UsersProps {
  users: User[];
  actor: User;
  onChange: () => Promise<void>;
}

export default function Users_({ users, actor, onChange }: UsersProps) {
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
                  <div className="flex gap-2">
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
    </div>
  );
}
