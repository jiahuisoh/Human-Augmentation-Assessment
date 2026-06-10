import { cls } from "../../../utils/helpers";
import type { AuditCategory, AuditLog } from "../../../types";

interface AuditProps {
  logs: AuditLog[];
}

const TAG_STYLE: Record<AuditCategory, string> = {
  TOKEN:      "bg-indigo-50 text-indigo-700 border-indigo-200",
  AUTH:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  ADMIN:      "bg-violet-50 text-violet-700 border-violet-200",
  CONTRACT:   "bg-amber-50 text-amber-700 border-amber-200",
  CONSENT:    "bg-blue-50 text-blue-700 border-blue-200",
  AI:         "bg-gray-100 text-gray-600 border-gray-200",
  CV:         "bg-violet-50 text-violet-700 border-violet-200",
  ASSESSMENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function Audit({ logs }: AuditProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-gray-500 text-xs font-mono ml-2">hana-platform · audit-trail · full-access</span>
      </div>
      <div className="p-4 h-96 overflow-y-auto font-mono text-xs space-y-1">
        {logs.map(l => {
          const col = l.level === "WARN" ? "text-amber-600"
            : l.level === "ERROR" ? "text-red-600"
            : "text-gray-700";
          return (
            <div key={l._id} className="flex gap-3">
              <span className="text-gray-400 flex-shrink-0">
                {new Date(l.createdAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={cls("px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 self-start", TAG_STYLE[l.category])}>
                {l.category}
              </span>
              <span className={col}>{l.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
