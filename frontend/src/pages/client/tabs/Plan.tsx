import { CheckCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { InterventionPlan } from "../../../types";

interface PlanProps {
  plan: InterventionPlan | null;
}

export default function Plan({ plan }: PlanProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-1">My intervention plan</h3>
      <p className="text-xs text-gray-400 mb-4">Created and managed by your clinician - view only.</p>
      {!plan ? (
        <p className="text-sm text-gray-400">No active plan yet - your clinician will set this up after your first assessment.</p>
      ) : plan.items.map((it, i) => (
        <div key={i} className={cls("flex items-center gap-3 p-3 rounded-xl mb-2", it.done ? "bg-green-50" : "bg-gray-50")}>
          <CheckCircle size={18} className={it.done ? "text-green-500" : "text-gray-300"} />
          <div className="flex-1">
            <div className={cls("text-sm font-medium", it.done ? "line-through text-gray-400" : "text-gray-900")}>{it.activity}</div>
            <div className="text-xs text-gray-400">{it.frequency}{it.duration ? ` · ${it.duration}` : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
