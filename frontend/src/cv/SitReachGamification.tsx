import { cls } from "../utils/helpers";

/** How far short of the toes (cm) maps to an empty distance bar. */
const SHORT_OF_TOES_CM = 20;
/** Place star slightly above the toe landmark (normalized image Y). */
const STAR_Y_OFFSET = 0.10;

export interface ToeAnchor {
  x: number;
  y: number;
}

export interface SitReachGamificationProps {
  rawCm?:      number;
  bestCm?:     number;
  holdProgress?: number;
  formValid?:  boolean;
  status?:     string;
  /** Normalized toe position (0–1) from pose landmarks — star sits here. */
  toe?:        ToeAnchor | null;
}

/** Progress toward the toes: 0 = well short, 1 = at or past toes (star). */
function progressToToes(cm: number | undefined): number {
  if (cm === undefined || cm === null) return 0;
  return Math.max(0, Math.min(1, (cm + SHORT_OF_TOES_CM) / SHORT_OF_TOES_CM));
}

/** Reach-for-the-star overlay: star tracks toes; only measures when form is valid. */
export default function SitReachGamification({
  rawCm,
  bestCm,
  holdProgress = 0,
  formValid = false,
  status,
  toe,
}: SitReachGamificationProps) {
  const liveCm = formValid ? rawCm : undefined;
  const progress = progressToToes(liveCm);
  const reachedStar = liveCm !== undefined && liveCm !== null && liveCm >= 0;
  const holding = formValid && holdProgress > 0 && holdProgress < 1;
  const locked = status === "Score locked!";
  const shining = reachedStar || locked;

  const starStyle = toe
    ? {
        left: `${toe.x * 100}%`,
        top: `${Math.max(0.02, toe.y - STAR_Y_OFFSET) * 100}%`,
        transform: "translate(-50%, -50%)",
      }
    : {
        // Fallback only if toes not visible yet
        left: "72%",
        top: "62%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
      {/* Star — anchored to toe landmarks */}
      <div className="absolute transition-[left,top] duration-100 ease-out" style={starStyle}>
        <div
          className={cls(
            "relative flex flex-col items-center transition-all duration-300",
            shining ? "scale-125" : "scale-100 opacity-80",
          )}
        >
          {shining && (
            <div
              className="absolute inset-0 -m-4 rounded-full bg-amber-300/40 blur-xl animate-pulse"
              aria-hidden
            />
          )}
          <div
            className={cls(
              "text-4xl sm:text-5xl relative transition-all duration-300",
              shining
                ? "drop-shadow-[0_0_20px_rgba(250,204,21,1)] brightness-125 animate-pulse"
                : "drop-shadow-[0_0_6px_rgba(250,204,21,0.45)]",
            )}
          >
            ⭐
          </div>
          <p className={cls(
            "text-[10px] text-center font-bold mt-0.5 whitespace-nowrap",
            shining ? "text-amber-200" : "text-amber-200/80",
          )}>
            {shining ? "You reached it!" : "Toes"}
          </p>
        </div>
      </div>

      {/* Distance bar — only fills when form is valid */}
      <div className="absolute left-4 right-4 bottom-[10%]">
        <div className="flex justify-between text-[10px] text-gray-300 mb-1 px-1">
          <span>Start</span>
          <span>
            {!formValid
              ? "paused"
              : liveCm !== undefined
              ? `${liveCm >= 0 ? "+" : ""}${liveCm.toFixed(1)} cm`
              : "—"}
          </span>
          <span>⭐ Toes</span>
        </div>
        <div className="h-3 bg-gray-800/80 rounded-full overflow-hidden border border-gray-600/50">
          <div
            className={cls(
              "h-full rounded-full transition-all duration-150",
              !formValid
                ? "bg-gray-600"
                : shining
                ? "bg-gradient-to-r from-amber-400 to-yellow-200"
                : "bg-gradient-to-r from-violet-500 to-amber-400",
            )}
            style={{ width: `${formValid ? progress * 100 : 0}%` }}
          />
        </div>
        {bestCm !== undefined && (
          <p className="text-[10px] text-emerald-300 text-center mt-1 font-semibold">
            Official best: {bestCm >= 0 ? "+" : ""}{bestCm.toFixed(1)} cm
          </p>
        )}
      </div>

      {/* Hold steady meter */}
      {(holding || locked) && (
        <div className="absolute top-[14%] left-4 right-4">
          <p className="text-xs text-center text-amber-100 font-bold mb-1">
            {locked ? "Nice hold — score locked!" : "Hold steady!"}
          </p>
          <div className="h-2.5 bg-gray-800/80 rounded-full overflow-hidden border border-amber-500/40">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(100, holdProgress * 100)}%` }}
            />
          </div>
          {!locked && (
            <p className="text-[10px] text-amber-200 text-center mt-1">
              {Math.round(holdProgress * 100)}% — keep still for 3 seconds
            </p>
          )}
        </div>
      )}
    </div>
  );
}
