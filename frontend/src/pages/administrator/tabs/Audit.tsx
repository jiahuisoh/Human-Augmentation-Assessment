import { cls } from "../../../utils/helpers";
import type { AuditCategory, AuditLog } from "../../../types";

interface AuditProps {
  logs: AuditLog[];
}

const TAG_STYLE: Record<AuditCategory, string> = {
  TOKEN:      "bg-indigo-950 text-indigo-400 border-indigo-900",
  AUTH:       "bg-emerald-950 text-emerald-400 border-emerald-900",
  ADMIN:      "bg-violet-950 text-violet-400 border-violet-900",
  CONTRACT:   "bg-amber-950 text-amber-400 border-amber-900",
  CONSENT:    "bg-blue-950 text-blue-400 border-blue-900",
  AI:         "bg-slate-800 text-slate-400 border-slate-700",
  CV:         "bg-violet-950 text-violet-400 border-violet-900",
  ASSESSMENT: "bg-emerald-950 text-emerald-400 border-emerald-900",
};

export default function Audit({ logs }: AuditProps) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
      <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <div className="w-2 h-2 rounded-full bg-amber-500" />
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-slate-600 text-xs font-mono ml-2">hana-platform · audit-trail · full-access</span>
      </div>
      <div className="p-4 h-96 overflow-y-auto font-mono text-xs space-y-1">
        {logs.map(l => {
          const col = l.level === "WARN" ? "text-amber-300"
            : l.level === "ERROR" ? "text-red-300"
            : "text-slate-300";
          return (
            <div key={l._id} className="flex gap-3">
              <span className="text-slate-600 flex-shrink-0">
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
