import { cls } from "../../../utils/helpers";
import type { AuditLog } from "../../../types";

interface LogsProps {
  logs: AuditLog[];
}

/** Developer scope: technical categories only, never PII-tagged categories. */
const VISIBLE_CATEGORIES = new Set(["CONTRACT", "CV", "TOKEN"]);

export default function Logs({ logs }: LogsProps) {
  const filtered = logs.filter(l => VISIBLE_CATEGORIES.has(l.category));
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="bg-slate-800 px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-slate-500 text-xs font-mono ml-2">hana-platform · technical-logs · developer-view</span>
        </div>
        <div className="p-4 h-80 overflow-y-auto font-mono text-xs space-y-1">
          {filtered.map(l => (
            <div key={l._id} className="flex gap-3">
              <span className="text-slate-600 flex-shrink-0">
                {new Date(l.createdAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={cls(
                "flex-shrink-0 w-10",
                l.level === "ERROR" ? "text-red-400" : l.level === "WARN" ? "text-amber-400" : "text-slate-500",
              )}>{l.level}</span>
              <span className={l.level === "WARN" ? "text-amber-300" : "text-slate-300"}>{l.message}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-500">
        Technical logs only. No patient-identifiable information is included in developer log access.
      </div>
    </div>
  );
}
