import { useEffect, useState } from "react";
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
  const unverified = users.filter(u => u.role === "client" && u.verificationStatus !== "verified" && u.verificationStatus !== "suspended").length;

  const [health, setHealth] = useState<{ api: string; cv: string }>({ api: "checking…", cv: "checking…" });
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4502";
    fetch(`${apiBase}/health`)
      .then(r => setHealth(h => ({ ...h, api: r.ok ? "Connected" : "Error" })))
      .catch(() => setHealth(h => ({ ...h, api: "Unreachable" })));
    const cvBase = (import.meta.env.VITE_CV_WS_URL || "ws://localhost:4501").replace(/^ws/, "http");
    fetch(`${cvBase}/health`)
      .then(r => setHealth(h => ({ ...h, cv: r.ok ? "Connected" : "Error" })))
      .catch(() => setHealth(h => ({ ...h, cv: "Unreachable" })));
  }, []);
  const statusCol = (v: string): string =>
    v === "Connected" ? "text-emerald-600" : v.startsWith("checking") ? "text-gray-400" : "text-red-600";

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
          <div className="text-sm font-semibold text-gray-900 mb-3">System health <span className="text-xs font-normal text-gray-400">· live</span></div>
          {([
            ["Backend API", health.api],
            ["CV service",  health.cv],
          ] as const).map(([l, v]) => (
            <div key={l} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-500">{l}</span>
              <span className={cls("text-xs font-mono font-semibold", statusCol(v))}>{v}</span>
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
