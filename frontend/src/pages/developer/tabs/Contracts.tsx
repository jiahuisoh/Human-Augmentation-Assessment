import { AlertTriangle, Lock } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { SmartContract } from "../../../types";

interface ContractsProps {
  contracts: SmartContract[];
}

export default function Contracts({ contracts }: ContractsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Smart contract registry (read-only)</h3>
        {contracts.map(c => (
          <div key={c._id} className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
            <div>
              <div className="text-sm font-mono text-slate-200">{c.name}</div>
              <div className="text-xs text-slate-500">{c.version} · {c.env}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={cls(
                "text-xs font-semibold px-2 py-0.5 rounded",
                c.status === "live"
                  ? "text-emerald-400 bg-emerald-950/50 border border-emerald-900"
                  : "text-amber-400 bg-amber-950/50 border border-amber-900",
              )}>
                {c.status}
              </span>
              <button type="button" disabled title="Deployment requires administrator approval"
                className="flex items-center gap-1 text-xs text-slate-600 cursor-not-allowed">
                <Lock size={11} /> Deploy
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-amber-950/30 border border-amber-900 rounded-lg p-3 text-xs text-amber-400 flex items-center gap-2">
        <AlertTriangle size={13} />
        Smart contract deployment to production requires administrator final approval. Developers may only read contracts and test in sandbox.
      </div>
    </div>
  );
}
