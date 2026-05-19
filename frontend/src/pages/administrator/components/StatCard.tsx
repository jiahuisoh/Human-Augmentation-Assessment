import type { LucideIcon } from "lucide-react";
import { cls } from "../../../utils/helpers";

interface StatCardProps {
  label: string;
  value: string;
  Icon: LucideIcon;
  col: string;
  sub?: string;
  subCol?: string;
}

export default function StatCard({ label, value, Icon, col, sub, subCol = "text-slate-500" }: StatCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className={col} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className={cls("text-2xl font-semibold leading-none mb-1", col)}>{value}</div>
      {sub && <div className={cls("text-xs", subCol)}>{sub}</div>}
    </div>
  );
}
