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
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-gray-500 text-xs font-mono ml-2">hana-platform · technical-logs · developer-view</span>
        </div>
        <div className="p-4 h-80 overflow-y-auto font-mono text-xs space-y-1">
          {filtered.map(l => (
            <div key={l._id} className="flex gap-3">
              <span className="text-gray-400 flex-shrink-0">
                {new Date(l.createdAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={cls(
                "flex-shrink-0 w-10",
                l.level === "ERROR" ? "text-red-600" : l.level === "WARN" ? "text-amber-600" : "text-gray-400",
              )}>{l.level}</span>
              <span className={l.level === "WARN" ? "text-amber-600" : "text-gray-700"}>{l.message}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-500">
        Technical logs only. No patient-identifiable information is included in developer log access.
      </div>
    </div>
  );
}
