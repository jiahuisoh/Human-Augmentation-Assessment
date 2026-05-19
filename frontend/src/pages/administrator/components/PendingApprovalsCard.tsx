import { AlertTriangle } from "lucide-react";
import type { SmartContract, TokenTransaction } from "../../../types";

interface PendingApprovalsCardProps {
  tokens: TokenTransaction[];
  contracts: SmartContract[];
  onApproveToken: (id: string) => Promise<void>;
  onRejectToken: (id: string, reason: string) => Promise<void>;
  onApproveContract: (id: string) => Promise<void>;
}

export default function PendingApprovalsCard({
  tokens, contracts, onApproveToken, onRejectToken, onApproveContract,
}: PendingApprovalsCardProps) {
  const isEmpty = tokens.length === 0 && contracts.length === 0;

  return (
    <div className="bg-slate-800 border border-amber-800/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} className="text-amber-400" />
        <span className="text-xs font-semibold text-amber-300">Pending administrator approvals</span>
      </div>

      {tokens.map(t => (
        <div key={t._id} className="flex items-center justify-between py-2.5 border-b border-slate-700 last:border-0">
          <div>
            <div className="text-xs text-slate-300">
              High-value token award {t.amount > 0 ? "+" : ""}{t.amount} (client {t.clientId})
            </div>
            <div className="text-xs text-slate-600">
              Requested by {t.issuedBy ?? "system"} · {t.reason ?? "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void onApproveToken(t._id)}
              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 text-xs font-semibold rounded transition-colors">
              Approve
            </button>
            <button type="button" onClick={() => void onRejectToken(t._id, "Rejected via overview")}
              className="px-2.5 py-1 border border-red-800 bg-red-950/50 text-red-300 text-xs font-semibold rounded hover:bg-red-900/50 transition-colors">
              Reject
            </button>
          </div>
        </div>
      ))}

      {contracts.map(c => (
        <div key={c._id} className="flex items-center justify-between py-2.5 border-b border-slate-700 last:border-0">
          <div>
            <div className="text-xs text-slate-300">Smart contract deployment: {c.name} {c.version}</div>
            <div className="text-xs text-slate-600">{c.env}</div>
          </div>
          <button type="button" onClick={() => void onApproveContract(c._id)}
            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 text-xs font-semibold rounded transition-colors">
            Approve deployment
          </button>
        </div>
      ))}

      {isEmpty && <p className="text-xs text-slate-500 py-2">No pending approvals.</p>}
    </div>
  );
}
