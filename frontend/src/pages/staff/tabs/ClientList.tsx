import { useState } from "react";
import { Search, X } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { userApi } from "../../../utils/api";
import { ClientProfile } from "../../../components/ClientProfile";
import type { EmergencyContact, ScheduleEntry, User } from "../../../types";

interface ClientListProps {
  schedule: ScheduleEntry[];
  search: string;
  onSearch: (v: string) => void;
}

export default function ClientList({ schedule, search, onSearch }: ClientListProps) {
  const filtered = schedule.filter(s => s.clientName.toLowerCase().includes(search.toLowerCase()));

  const [viewing, setViewing]     = useState<User | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState("");

  // Staff may correct the emergency contact while assisting a client in
  // person; the section itself asks for confirmation before saving.
  const saveContactFor = async (contactValue: EmergencyContact): Promise<void> => {
    if (!viewing) return;
    setViewing(await userApi.saveEmergencyContact(viewing._id, contactValue));
  };

  const openProfile = async (clientId: string): Promise<void> => {
    setProfileErr("");
    setLoadingId(clientId);
    try {
      setViewing(await userApi.getById(clientId));
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "Failed to load the profile.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="client-search" className="block text-xs font-medium text-gray-500 mb-1">Search Clients</label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input id="client-search" value={search} onChange={e => onSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-teal-500 focus:outline-none" />
        </div>
      </div>

      {profileErr && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs font-medium text-red-700">
          {profileErr}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Name", "Programme", "NRIC Status", "Schedule", ""].map((h, i) => (
              <th key={h || i} className="text-left px-4 py-2.5 font-medium text-gray-500">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s => (
              <tr key={s._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.clientName}</td>
                <td className="px-4 py-3 text-gray-500">Active Ageing Programme</td>
                <td className="px-4 py-3">
                  <span className={cls("px-2 py-0.5 rounded-full text-xs font-semibold",
                    s.nricVerified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
                  )}>
                    {s.nricVerified ? "Verified" : "Not verified"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{s.time} today</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" disabled={loadingId === s.clientId}
                    onClick={() => void openProfile(s.clientId)}
                    className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 disabled:opacity-50 text-teal-700 text-xs font-semibold transition-colors">
                    {loadingId === s.clientId ? "Loading…" : "View Profile"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">{viewing.name}</h3>
              <button type="button" onClick={() => setViewing(null)} aria-label="Close profile"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>
            <ClientProfile user={viewing} accent="teal" onSaveEmergencyContact={saveContactFor} />
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        Staff view covers scheduling, operational data and client profiles (including the emergency
        contact). Clinical assessment records are accessible to assigned clinicians only.
      </div>
    </div>
  );
}
