import { cls } from "../utils/helpers";

/** How far short of the toes (cm) maps to an empty distance bar. */
const SHORT_OF_TOES_CM = 20;

export interface SitReachGamificationProps {
  rawCm?:      number;
  bestCm?:     number;
  holdProgress?: number;
  formValid?:  boolean;
  status?:     string;
}

/** Progress toward the toes: 0 = well short, 1 = at or past toes (star). */
function progressToToes(cm: number | undefined): number {
  if (cm === undefined || cm === null) return 0;
  return Math.max(0, Math.min(1, (cm + SHORT_OF_TOES_CM) / SHORT_OF_TOES_CM));
}

/** Reach-for-the-star overlay: star stays above the toes and shines when you get there. */
export default function SitReachGamification({
  rawCm,
  bestCm,
  holdProgress = 0,
  formValid = false,
  status,
}: SitReachGamificationProps) {
  const progress = progressToToes(rawCm);
  const reachedStar = rawCm !== undefined && rawCm !== null && rawCm >= 0;
  const sidekickReach = progress * 42;
  const holding = formValid && holdProgress > 0 && holdProgress < 1;
  const locked = status === "Score locked!";
  const shining = reachedStar || locked;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Sidekick buddy — mirrors your reach on the left */}
      <div className="absolute left-[6%] bottom-[18%] w-[22%] max-w-[110px]">
        <svg viewBox="0 0 100 120" className="w-full h-auto drop-shadow-lg" aria-hidden>
          <circle cx="50" cy="18" r="14" fill="#a78bfa" />
          <rect x="42" y="32" width="16" height="34" rx="6" fill="#8b5cf6" />
          <line x1="42" y1="40" x2={18 - sidekickReach * 0.15} y2={58 + sidekickReach * 0.1} stroke="#c4b5fd" strokeWidth="6" strokeLinecap="round" />
          <line x1="58" y1="40" x2={82 + sidekickReach * 0.35} y2={52 + sidekickReach * 0.05} stroke="#c4b5fd" strokeWidth="6" strokeLinecap="round" />
          <line x1="46" y1="66" x2="38" y2="98" stroke="#7c3aed" strokeWidth="7" strokeLinecap="round" />
          <line x1="54" y1="66" x2="70" y2="98" stroke="#7c3aed" strokeWidth="7" strokeLinecap="round" />
        </svg>
        <p className="text-[10px] text-violet-200 text-center mt-1 font-semibold">Buddy</p>
      </div>

      {/* Star — fixed above the toe line; shines when reach reaches the feet */}
      <div
        className="absolute bottom-[26%] right-[14%] sm:right-[16%]"
        style={{ transform: "translateX(50%)" }}
      >
        <div
          className={cls(
            "relative flex flex-col items-center transition-all duration-300",
            shining ? "scale-125" : "scale-100 opacity-70",
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
              "text-5xl sm:text-6xl relative transition-all duration-300",
              shining
                ? "drop-shadow-[0_0_20px_rgba(250,204,21,1)] brightness-125 animate-pulse"
                : "drop-shadow-[0_0_6px_rgba(250,204,21,0.4)] grayscale-[30%]",
            )}
          >
            ⭐
          </div>
          <p className={cls(
            "text-[10px] text-center font-bold mt-0.5",
            shining ? "text-amber-200" : "text-amber-200/70",
          )}>
            {shining ? "You reached it!" : "Toes"}
          </p>
        </div>
      </div>

      {/* Distance bar — fills toward the toes/star */}
      <div className="absolute left-4 right-4 bottom-[10%]">
        <div className="flex justify-between text-[10px] text-gray-300 mb-1 px-1">
          <span>Start</span>
          <span>{rawCm !== undefined ? `${rawCm >= 0 ? "+" : ""}${rawCm.toFixed(1)} cm` : "—"}</span>
          <span>⭐ Toes</span>
        </div>
        <div className="h-3 bg-gray-800/80 rounded-full overflow-hidden border border-gray-600/50">
          <div
            className={cls(
              "h-full rounded-full transition-all duration-150",
              shining
                ? "bg-gradient-to-r from-amber-400 to-yellow-200"
                : formValid
                ? "bg-gradient-to-r from-violet-500 to-amber-400"
                : "bg-gray-500",
            )}
            style={{ width: `${progress * 100}%` }}
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
              {Math.round(holdProgress * 100)}% — keep still for 2 seconds
            </p>
          )}
        </div>
      )}
    </div>
  );
}
