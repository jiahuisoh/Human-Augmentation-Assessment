import { Activity, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { cls, formatLogStamp } from "../../../utils/helpers";
import { formatUptime, type HealthReport } from "../DeveloperShared";

interface SystemHealthProps {
  report: HealthReport | null;
  checking: boolean;
  onRefresh: () => void;
}

export default function SystemHealth({ report, checking, onRefresh }: SystemHealthProps) {
  const failing = report?.checks.filter(c => !c.ok).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Activity size={15} className="text-violet-600" /> System health
          </h3>
          <button type="button" onClick={onRefresh} disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 disabled:opacity-50 text-violet-700 text-xs font-semibold transition-colors">
            <RefreshCw size={12} className={cls(checking && "animate-spin")} />
            {checking ? "Checking…" : "Re-run checks"}
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          {report
            ? `Last checked ${formatLogStamp(report.checkedAt)}${failing > 0 ? ` · ${failing} failing` : " · all clear"}`
            : "Running the first check…"}
        </p>

        <div className="divide-y divide-gray-100">
          {(report?.checks ?? []).map(c => (
            <div key={c.label} className="flex items-start gap-3 py-3">
              {c.ok
                ? <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                : <XCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900">{c.label}</div>
                <div className={cls("text-xs mt-0.5 break-words", c.ok ? "text-gray-500" : "text-red-600")}>
                  {c.detail}
                </div>
              </div>
              <span className={cls(
                "px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0",
                c.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
              )}>
                {c.ok ? "OK" : "FAIL"}
              </span>
            </div>
          ))}
        </div>

        {report && (
          <div className="flex gap-6 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>Uptime <span className="font-mono text-gray-700">{formatUptime(report.uptimeSeconds)}</span></span>
            <span>Node <span className="font-mono text-gray-700">{report.node ?? "-"}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
