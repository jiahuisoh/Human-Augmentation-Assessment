import { Coins } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { TokenTransaction } from "../../../types";

interface TokensProps {
  balance: number;
  history: TokenTransaction[];
}

export default function Tokens({ balance, history }: TokensProps) {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="text-violet-200 text-sm mb-1 flex items-center gap-2"><Coins size={16} /> HANA Health Tokens</div>
        <div className="text-5xl font-black mb-1">{balance}</div>
        <div className="text-violet-200 text-xs">Non-transferable · Non-financial · Engagement-based</div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Token history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No transactions yet — complete an assessment to earn your first tokens.</p>
        ) : history.slice(0, 12).map(t => (
          <div key={t._id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div>
              <div className="text-sm text-gray-800 capitalize">{t.eventType.replace(/_/g, " ")}</div>
              <div className="text-xs text-gray-400">
                {new Date(t.createdAt).toLocaleDateString("en-SG")}
                {t.requiresApproval ? " · Pending approval" : ""}
              </div>
            </div>
            <span className={cls("text-sm font-bold", t.amount >= 0 ? "text-green-600" : "text-red-500")}>
              {t.amount >= 0 ? "+" : ""}{t.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
