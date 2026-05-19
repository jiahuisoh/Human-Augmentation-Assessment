import { Plus } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { RedemptionCatalogueItem } from "../../../types";

interface CatalogueProps {
  items: RedemptionCatalogueItem[];
}

export default function Catalogue({ items }: CatalogueProps) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Redemption catalogue management</h3>
          <button type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 text-xs font-semibold rounded-lg">
            <Plus size={12} /> New item
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {items.map(it => (
            <div key={it._id} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
              <div className="text-sm font-semibold text-slate-200">{it.name}</div>
              <div className="text-xs text-slate-500 mb-2">{it.category}</div>
              <p className="text-xs text-slate-400 mb-2">{it.description}</p>
              <div className="flex items-center justify-between">
                <span className="bg-indigo-950 text-indigo-300 border border-indigo-900 text-xs font-bold px-2 py-0.5 rounded-full">
                  {it.costTokens} tokens
                </span>
                <span className={cls("text-xs", it.active ? "text-emerald-400" : "text-slate-600")}>
                  {it.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
