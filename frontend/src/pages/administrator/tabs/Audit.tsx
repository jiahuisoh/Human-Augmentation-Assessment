import { cls, formatLogStamp } from "../../../utils/helpers";
import { AUDIT_CATEGORY_STYLE } from "../../../utils/constants";
import type { AuditLog } from "../../../types";

interface AuditProps {
  logs: AuditLog[];
}

export default function Audit({ logs }: AuditProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-gray-500 text-xs font-mono ml-2">HANA-Platform · Audit-Trail · Full-Access</span>
      </div>
      <div className="p-4 h-96 overflow-y-auto font-mono text-xs space-y-1">
        {logs.map(l => {
          const col = l.level === "WARN" ? "text-amber-600"
            : l.level === "ERROR" ? "text-red-600"
            : "text-gray-700";
          return (
            <div key={l._id} className="flex gap-3">
              <span className="text-gray-400 flex-shrink-0 w-36">
                {formatLogStamp(l.createdAt)}
              </span>
              <span className={cls("px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 self-start", AUDIT_CATEGORY_STYLE[l.category])}>
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
