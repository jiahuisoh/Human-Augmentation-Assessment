import { Shield } from "lucide-react";
import { cls } from "../utils/helpers";
import { LIVENESS_THRESHOLD } from "../utils/constants";

interface LivenessDetectionProps {
  score: number;       // 0..1
  showDetails?: boolean;
}

export default function LivenessDetection({ score, showDetails = false }: LivenessDetectionProps) {
  const pct = Math.round((score || 0) * 100);
  const threshold = LIVENESS_THRESHOLD * 100;

  const colour = pct >= threshold ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400";
  const barColour = pct >= threshold ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="bg-gray-800 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Shield size={16} className={colour} />
          <span className="text-gray-300 text-sm font-semibold">Liveness Check</span>
        </div>
        <span className={cls("text-base font-black", colour)}>{pct}%</span>
      </div>

      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cls("h-full rounded-full transition-all duration-300", barColour)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {showDetails && (
        <p className="text-xs text-gray-500 mt-2">
          {pct >= threshold
            ? "Live human confirmed — tokens will be awarded"
            : pct >= 40
            ? "Keep going — make sure your full body is visible"
            : "Stand in front of the camera in good lighting"}
        </p>
      )}

      <div className="relative mt-1 h-[6px]">
        <div className="absolute top-0 w-px h-full bg-white/30" style={{ left: `${threshold}%` }} />
        <span className="absolute text-xs text-gray-500" style={{ left: `${threshold + 1}%`, top: -1 }}>
          {threshold}% needed
        </span>
      </div>
    </div>
  );
}
