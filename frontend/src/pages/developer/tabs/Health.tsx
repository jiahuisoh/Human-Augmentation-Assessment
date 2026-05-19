import { cls } from "../../../utils/helpers";

interface HealthMetric {
  label: string;
  value: string;
  status: "ok" | "warn";
}

const METRICS: ReadonlyArray<HealthMetric> = [
  { label: "API latency",      value: "14ms",  status: "ok"   },
  { label: "DB connections",   value: "8/50",  status: "ok"   },
  { label: "CV service",       value: "WARN",  status: "warn" },
  { label: "Token webhook",    value: "98.7%", status: "ok"   },
  { label: "Error rate (1h)",  value: "0.3%",  status: "ok"   },
  { label: "Memory usage",     value: "62%",   status: "ok"   },
];

export default function Health() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {METRICS.map(m => (
        <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-slate-400">{m.label}</span>
          <div className="flex items-center gap-2">
            <span className={cls("w-2 h-2 rounded-full", m.status === "ok" ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
            <span className={cls("text-sm font-mono font-semibold", m.status === "ok" ? "text-emerald-400" : "text-amber-400")}>{m.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
