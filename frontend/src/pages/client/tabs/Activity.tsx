import { useState } from "react";
import { Check } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { EXERCISES } from "../../../utils/constants";

export default function Activity() {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const toggle = (id: number): void => setDone(prev => ({ ...prev, [id]: !prev[id] }));
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Today's exercises</h3>
        <span className="text-xs text-gray-400">{doneCount} / {EXERCISES.length} done</span>
      </div>
      {EXERCISES.map(ex => (
        <div key={ex.id} className={cls(
          "flex items-center gap-4 p-3 rounded-xl border mb-2 transition-all",
          done[ex.id] ? "bg-green-50 border-green-200" : "bg-white border-gray-100 hover:border-violet-200",
        )}>
          <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
            <ex.Icon size={18} className="text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cls("text-base font-semibold", done[ex.id] ? "line-through text-gray-400" : "text-gray-900")}>
              {ex.name}
            </div>
            <div className="text-xs text-gray-500">{ex.detail} · {ex.duration}</div>
          </div>
          <button type="button" onClick={() => toggle(ex.id)}
            aria-label={done[ex.id] ? `Unmark ${ex.name}` : `Mark ${ex.name} as done`}
            className={cls(
              "w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
              done[ex.id] ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-violet-400",
            )}>
            {done[ex.id] && <Check size={18} className="text-white" />}
          </button>
        </div>
      ))}
    </div>
  );
}
