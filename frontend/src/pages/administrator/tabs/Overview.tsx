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
        <StatCard label="Total clients"  value={String(byRole(users, "client"))}    Icon={Users}    col="text-blue-400"   sub={`${unverified} unverified`} subCol="text-amber-500" />
        <StatCard label="Staff accounts"  value={String(byRole(users, "staff"))}     Icon={Activity} col="text-teal-400"   sub="All active" />
        <StatCard label="Clinicians"      value={String(byRole(users, "clinician"))} Icon={FileText} col="text-violet-400" sub="Active" />
        <StatCard label="Administrators"  value={String(byRole(users, "administrator"))} Icon={Shield} col="text-indigo-400" sub="Active" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-400 mb-3">System health</div>
          {([
            ["API uptime",       "99.9%",     "text-emerald-400"],
            ["CV service",        "WARN",      "text-amber-400"],
            ["MongoDB",           "Connected", "text-emerald-400"],
          ] as const).map(([l, v, col]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-slate-700 last:border-0">
              <span className="text-xs text-slate-500">{l}</span>
              <span className={cls("text-xs font-mono font-semibold", col)}>{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-xs font-semibold text-slate-400 mb-3">Module access summary</div>
          {([
            ["Functional Health Assessment", "Active"],
            ["AI recommendations",            "Active"],
            ["RBAC enforcement",              "5 roles configured"],
          ] as const).map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-slate-700 last:border-0">
              <span className="text-xs text-slate-500">{l}</span>
              <span className="text-xs text-emerald-400 font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
