import { useState } from "react";
import { Coins, Gift, ShoppingBag, X, CheckCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { RedemptionCatalogueItem, TokenTransaction } from "../../../types";

interface TokensProps {
  balance: number;
  history: TokenTransaction[];
  catalogue: RedemptionCatalogueItem[];
  onRedeem: (itemId: string) => Promise<void>;
}

const CATEGORY_COLOURS: Record<string, { bg: string; text: string }> = {
  Grocery:  { bg: "bg-green-100",  text: "text-green-700"  },
  Wellness: { bg: "bg-blue-100",   text: "text-blue-700"   },
  Activity: { bg: "bg-amber-100",  text: "text-amber-700"  },
};
function categoryStyle(cat: string) {
  return CATEGORY_COLOURS[cat] ?? { bg: "bg-gray-100", text: "text-gray-600" };
}

export default function Tokens({ balance, history, catalogue, onRedeem }: TokensProps) {
  const [confirming, setConfirming] = useState<RedemptionCatalogueItem | null>(null);
  const [redeeming,  setRedeeming]  = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true): void => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3500);
  };

  const confirmRedeem = async (): Promise<void> => {
    if (!confirming) return;
    setRedeeming(true);
    try {
      await onRedeem(confirming._id);
      showToast(`Redeemed: ${confirming.name} — enjoy your reward!`);
      setConfirming(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Redemption failed.", false);
    } finally {
      setRedeeming(false);
    }
  };

  const active = catalogue.filter(c => c.active);

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={cls(
          "fixed top-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg",
          toast.ok ? "bg-green-600" : "bg-red-600",
        )}>
          {toast.msg}
        </div>
      )}

      {/* Balance card */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="text-violet-200 text-sm mb-1 flex items-center gap-2">
          <Coins size={16} /> HANA Health Tokens
        </div>
        <div className="text-5xl font-black mb-1">{balance}</div>
        <div className="text-violet-200 text-xs">Non-transferable · Non-financial · Engagement-based</div>
      </div>

      {/* Redemption catalogue */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <Gift size={16} className="text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">Rewards catalogue</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">Spend your tokens on approved health-related rewards.</p>

        {active.length === 0 ? (
          <p className="text-sm text-gray-400">No rewards available right now — check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {active.map(item => {
              const canAfford = balance >= item.costTokens;
              const { bg, text } = categoryStyle(item.category);
              return (
                <div key={item._id}
                  className={cls(
                    "flex items-center justify-between rounded-xl border p-4 transition-colors",
                    canAfford ? "border-gray-100 bg-white" : "border-gray-100 bg-gray-50 opacity-60",
                  )}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <ShoppingBag size={18} className="text-violet-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                      <span className={cls("inline-block mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full", bg, text)}>
                        {item.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-3 flex-shrink-0">
                    <span className="text-sm font-black text-violet-700">{item.costTokens} pts</span>
                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => setConfirming(item)}
                      className={cls(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        canAfford
                          ? "bg-violet-600 hover:bg-violet-700 text-white"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed",
                      )}>
                      {canAfford ? "Redeem" : "Not enough"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Token history */}
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
                {t.reason ? ` · ${t.reason}` : ""}
                {t.requiresApproval ? " · Pending approval" : ""}
              </div>
            </div>
            <span className={cls("text-sm font-bold", t.amount >= 0 ? "text-green-600" : "text-red-500")}>
              {t.amount >= 0 ? "+" : ""}{t.amount}
            </span>
          </div>
        ))}
      </div>

      {/* Confirm redemption modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-violet-600" />
                <h3 className="text-base font-semibold text-gray-900">Confirm redemption</h3>
              </div>
              <button type="button" onClick={() => setConfirming(null)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="bg-violet-50 rounded-xl p-4 mb-4">
              <div className="text-sm font-semibold text-gray-900">{confirming.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{confirming.description}</div>
              <div className="text-lg font-black text-violet-700 mt-2">{confirming.costTokens} tokens</div>
            </div>

            <div className="flex justify-between text-xs text-gray-500 mb-4">
              <span>Your balance after redemption:</span>
              <span className="font-semibold text-gray-900">{balance - confirming.costTokens} tokens</span>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              Redemptions are final and logged. Tokens are non-transferable and cannot be refunded.
            </p>

            <div className="flex gap-2">
              <button type="button" disabled={redeeming} onClick={() => void confirmRedeem()}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
                {redeeming ? "Redeeming…" : "Confirm"}
              </button>
              <button type="button" onClick={() => setConfirming(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
