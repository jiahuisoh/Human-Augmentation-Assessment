import { useState } from "react";
import { Brain, CheckCircle, Edit3 } from "lucide-react";
import type { AIRecommendation } from "../../../types";

interface AIProps {
  recs: AIRecommendation[];
  onApprove:  (id: string) => Promise<void>;
  onOverride: (id: string, reason: string) => Promise<void>;
}

export default function AI({ recs, onApprove, onOverride }: AIProps) {
  return (
    <div className="space-y-4">
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800 flex items-start gap-2">
        <Brain size={16} className="text-violet-600 flex-shrink-0 mt-0.5" />
        Human-in-the-loop governance: AI recommendations need your approval or documented override before being applied.
      </div>
      {recs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          No pending AI recommendations.
        </div>
      ) : recs.map(r => (
        <AIRow key={r._id} rec={r} onApprove={onApprove} onOverride={onOverride} />
      ))}
    </div>
  );
}

interface AIRowProps {
  rec: AIRecommendation;
  onApprove:  (id: string) => Promise<void>;
  onOverride: (id: string, reason: string) => Promise<void>;
}

function AIRow({ rec, onApprove, onOverride }: AIRowProps) {
  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason]             = useState("");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Brain size={16} className="text-violet-600" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900 mb-0.5">{rec.title}</div>
          <div className="text-xs text-gray-500 mb-3">{rec.detail}</div>
          <div className="text-xs text-violet-600 bg-violet-50 rounded-lg p-2 mb-3">
            AI confidence: {rec.confidence}% · {rec.basis}
          </div>

          {!showOverride ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => void onApprove(rec._id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">
                <CheckCircle size={13} /> Approve
              </button>
              <button type="button" onClick={() => setShowOverride(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors">
                <Edit3 size={13} /> Override
              </button>
            </div>
          ) : (
            <div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="Reason for override (required)…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none mb-2" />
              <div className="flex gap-2">
                <button type="button" disabled={!reason.trim()} onClick={() => void onOverride(rec._id, reason)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                  Confirm override
                </button>
                <button type="button" onClick={() => setShowOverride(false)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
