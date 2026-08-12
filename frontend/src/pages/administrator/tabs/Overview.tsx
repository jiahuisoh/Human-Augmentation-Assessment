import { useEffect, useState } from "react";
import {
  Users, Activity, FileText, Shield,
  CheckCircle2, XCircle, Circle, type LucideIcon,
} from "lucide-react";
import { cls } from "../../../utils/helpers";
import StatCard from "../components/StatCard";
import type { Role, User } from "../../../types";

interface OverviewProps {
  users: User[];
}

const byRole = (users: User[], r: Role): number => users.filter(u => u.role === r).length;

const suspendedIn = (users: User[], r: Role): number =>
  users.filter(u => u.role === r && u.verificationStatus === "suspended").length;

const ROLE_TILES: ReadonlyArray<{ role: Role; label: string; Icon: LucideIcon; col: string }> = [
  { role: "staff",         label: "Staff Accounts",     Icon: Activity, col: "text-teal-600"   },
  { role: "clinician",     label: "Clinician Accounts", Icon: FileText, col: "text-violet-600" },
  { role: "administrator", label: "Administrators",     Icon: Shield,   col: "text-indigo-600" },
];

type ServiceStatus = "checking" | "connected" | "error" | "unreachable";

const STATUS: Record<ServiceStatus, { label: string; pill: string; tone: string; Icon: LucideIcon }> = {
  checking:    { label: "Checking…",   pill: "bg-gray-100 text-gray-500",      tone: "text-gray-400",    Icon: Circle       },
  connected:   { label: "Connected",   pill: "bg-emerald-50 text-emerald-700", tone: "text-emerald-600", Icon: CheckCircle2 },
  error:       { label: "Error",       pill: "bg-red-50 text-red-600",         tone: "text-red-600",     Icon: XCircle      },
  unreachable: { label: "Unreachable", pill: "bg-red-50 text-red-600",         tone: "text-red-600",     Icon: XCircle      },
};

export default function Overview({ users }: OverviewProps) {
  const unverified = users.filter(u => u.role === "client" && u.verificationStatus !== "verified" && u.verificationStatus !== "suspended").length;

  const [health, setHealth] = useState<{ api: ServiceStatus; cv: ServiceStatus }>({
    api: "checking", cv: "checking",
  });
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4502";
    fetch(`${apiBase}/health`)
      .then(r => setHealth(h => ({ ...h, api: r.ok ? "connected" : "error" })))
      .catch(() => setHealth(h => ({ ...h, api: "unreachable" })));
    const cvBase = (import.meta.env.VITE_CV_WS_URL || "ws://localhost:4501").replace(/^ws/, "http");
    fetch(`${cvBase}/health`)
      .then(r => setHealth(h => ({ ...h, cv: r.ok ? "connected" : "error" })))
      .catch(() => setHealth(h => ({ ...h, cv: "unreachable" })));
  }, []);

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Clients"  value={String(byRole(users, "client"))}    Icon={Users}    col="text-blue-600"   sub={`${unverified} Unverified`} subCol="text-amber-600" />
        {ROLE_TILES.map(({ role, label, Icon, col }) => {
          const suspended = suspendedIn(users, role);
          return (
            <StatCard key={role} label={label} value={String(byRole(users, role))} Icon={Icon} col={col}
              sub={suspended > 0 ? `${suspended} Suspended` : "All Active"}
              subCol={suspended > 0 ? "text-red-600" : undefined} />
          );
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">System Health</h3>
          <span className="text-xs text-gray-400">Live</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            ["Backend API", health.api],
            ["CV Service",  health.cv],
          ] as const).map(([label, status]) => {
            const s = STATUS[status];
            return (
              <div key={label} className="flex items-center gap-2.5 border border-gray-100 rounded-lg px-3 py-2.5">
                <s.Icon size={15} className={cls("flex-shrink-0", s.tone)} />
                <span className="flex-1 min-w-0 truncate text-xs font-medium text-gray-900">{label}</span>
                <span className={cls("flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold", s.pill)}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
