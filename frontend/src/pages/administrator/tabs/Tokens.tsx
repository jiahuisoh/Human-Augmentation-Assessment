import { Coins, AlertTriangle } from "lucide-react";
import StatCard from "../components/StatCard";
import type { TokenTransaction } from "../../../types";

interface TokensProps {
  pending: TokenTransaction[];
  onApprove: (id: string) => Promise<void>;
  onReject:  (id: string, reason: string) => Promise<void>;
}

const RULES = [
  ["Assessment completion",                   "25 tokens"],
  ["Session attendance",                       "10 tokens"],
  ["Adherence milestone (30 days)",            "50 tokens"],
  ["First assessment bonus",                   "50 tokens"],
  ["High-value threshold (requires approval)", "100 tokens"],
] as const;

export default function Tokens({ pending, onApprove, onReject }: TokensProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total minted"        value="14,320"                Icon={Coins}         col="text-indigo-400" />
        <StatCard label="Pending approval"     value={String(pending.length)} Icon={AlertTriangle} col="text-amber-400" sub="High-value rewards" subCol="text-amber-500" />
        <StatCard label="Revocation requests"  value="1"                     Icon={AlertTriangle} col="text-red-400" />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Pending high-value approvals</h3>
        {pending.length === 0
          ? <p className="text-xs text-slate-500">No pending approvals.</p>
          : pending.map(t => (
            <div key={t._id} className="flex items-center justify-between py-3 border-b border-slate-700 last:border-0">
              <div>
                <div className="text-sm text-slate-200">{t.amount > 0 ? "+" : ""}{t.amount} tokens · client {t.clientId}</div>
                <div className="text-xs text-slate-500">{t.reason ?? "—"}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void onApprove(t._id)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 text-xs font-semibold rounded-lg">Approve</button>
                <button type="button" onClick={() => void onReject(t._id, "Rejected")}
                  className="px-3 py-1.5 border border-red-800 text-red-300 text-xs font-semibold rounded-lg hover:bg-red-900/30">Reject</button>
              </div>
            </div>
          ))}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Incentive configuration</h3>
        <p className="text-xs text-slate-500 mb-4">Configure token award rules. All changes are logged and audited.</p>
        {RULES.map(([rule, val]) => (
          <div key={rule} className="flex items-center justify-between py-2.5 border-b border-slate-700 last:border-0">
            <span className="text-xs text-slate-400">{rule}</span>
            <span className="text-xs font-mono text-indigo-400">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
