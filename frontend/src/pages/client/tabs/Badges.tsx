import { cls } from "../../../utils/helpers";
import { BADGES_DATA } from "../../../utils/constants";

export default function Badges() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">My achievements</h3>
      <div className="grid grid-cols-3 gap-3">
        {BADGES_DATA.map(b => (
          <div key={b.id} className={cls(
            "text-center p-3 rounded-xl border",
            b.earned ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100 opacity-50",
          )}>
            <div className={cls(
              "w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2",
              b.earned ? "bg-amber-100" : "bg-gray-200",
            )}>
              <b.Icon size={20} className={cls(b.earned ? "text-amber-600" : "text-gray-400")} />
            </div>
            <div className="text-xs font-semibold text-gray-900">{b.name}</div>
            {b.earned && b.date && <div className="text-xs text-gray-400 mt-0.5">{b.date}</div>}
            <div className={cls("text-xs font-bold mt-1", b.earned ? "text-amber-600" : "text-gray-400")}>+{b.tokens}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
