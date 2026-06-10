import {
  Users, Activity, FileText, Shield,
} from "lucide-react";
import { cls } from "../../../utils/helpers";
import StatCard from "../components/StatCard";
import type { Role, User } from "../../../types";

interface OverviewProps {
  users: User[];
}

const byRole = (users: User[], r: Role): number => users.filter(u => u.role === r).length;

export default function Overview({ users }: OverviewProps) {
  const unverified = users.filter(u => u.role === "client" && u.verificationStatus !== "verified").length;

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total clients"  value={String(byRole(users, "client"))}    Icon={Users}    col="text-blue-600"   sub={`${unverified} unverified`} subCol="text-amber-600" />
        <StatCard label="Staff accounts"  value={String(byRole(users, "staff"))}     Icon={Activity} col="text-teal-600"   sub="All active" />
        <StatCard label="Clinicians"      value={String(byRole(users, "clinician"))} Icon={FileText} col="text-violet-600" sub="Active" />
        <StatCard label="Administrators"  value={String(byRole(users, "administrator"))} Icon={Shield} col="text-indigo-600" sub="Active" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">System health</div>
          {([
            ["API uptime",       "99.9%",     "text-emerald-600"],
            ["CV service",        "WARN",      "text-amber-600"],
            ["MongoDB",           "Connected", "text-emerald-600"],
          ] as const).map(([l, v, col]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-500">{l}</span>
              <span className={cls("text-xs font-mono font-semibold", col)}>{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">Module access summary</div>
          {([
            ["Functional Health Assessment", "Active"],
            ["AI recommendations",            "Active"],
            ["RBAC enforcement",              "5 roles configured"],
          ] as const).map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-500">{l}</span>
              <span className="text-xs text-emerald-600 font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
