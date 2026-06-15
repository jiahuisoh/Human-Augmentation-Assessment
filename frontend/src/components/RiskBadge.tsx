import type { RiskLevel } from "../types";
import { cls } from "../utils/helpers";

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

const STYLES: Record<RiskLevel, { bg: string; text: string }> = {
  low:      { bg: "bg-emerald-100", text: "text-emerald-700" },
  moderate: { bg: "bg-amber-100",   text: "text-amber-700"   },
  high:     { bg: "bg-red-100",     text: "text-red-700"     },
};

export default function RiskBadge({ level, className }: RiskBadgeProps) {
  const s = STYLES[level];
  return (
    <span className={cls("inline-flex items-center px-3 py-1 rounded-full text-sm font-bold", s.bg, s.text, className)}>
      {level.toUpperCase()}
    </span>
  );
}
