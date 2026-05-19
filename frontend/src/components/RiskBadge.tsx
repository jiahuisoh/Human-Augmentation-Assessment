import type { RiskLevel } from "../types";
import { cls } from "../utils/helpers";

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

const STYLES: Record<RiskLevel, { bg: string; text: string; dot: string }> = {
  low:      { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  moderate: { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"   },
  high:     { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"     },
};

export default function RiskBadge({ level, className }: RiskBadgeProps) {
  const s = STYLES[level];
  return (
    <span className={cls("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold", s.bg, s.text, className)}>
      <span className={cls("w-2 h-2 rounded-full", s.dot)} />
      {level.toUpperCase()}
    </span>
  );
}
