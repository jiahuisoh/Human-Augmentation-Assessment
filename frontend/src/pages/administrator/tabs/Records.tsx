import { AlertTriangle } from "lucide-react";
import { cls } from "../../../utils/helpers";

const FEATURES = [
  ["Consent events on-chain",       "active",   "Records consent grants and revocations"],
  ["Assessment record hashes",       "active",   "SHA-256 proofs, no raw data"],
  ["Verification proofs",            "active",   "Zero-knowledge proof system"],
  ["Access permission logs",         "active",   "Who accessed which records when"],
  ["Raw clinical data on-chain",     "disabled", "Never stored on-chain (PDPA)"],
] as const;

export default function Records() {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-2">
        <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
        Raw health data is stored off-chain. This panel manages consent events, record hashes, verification proofs, and access permissions only — not clinical content.
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Blockchain record governance</h3>
        {FEATURES.map(([feature, status, desc]) => (
          <div key={feature} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
            <div>
              <div className="text-xs text-gray-800">{feature}</div>
              <div className="text-xs text-gray-400">{desc}</div>
            </div>
            <span className={cls("text-xs font-semibold", status === "active" ? "text-emerald-600" : "text-red-600")}>
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
