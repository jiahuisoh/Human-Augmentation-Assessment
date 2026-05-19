import type { RedemptionCatalogueItem } from "../../../types";

interface CatalogueProps {
  items: RedemptionCatalogueItem[];
}

export default function Catalogue({ items }: CatalogueProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Redemption catalogue</h3>
        <p className="text-xs text-gray-400 mb-4">
          View only. Staff can assist clients with redemptions but cannot edit catalogue items — that is governed by the Administrator.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {items.map(it => (
            <div key={it._id} className="border border-gray-200 rounded-xl p-3">
              <div className="text-sm font-semibold text-gray-900">{it.name}</div>
              <div className="text-xs text-gray-400 mb-2">{it.category}</div>
              <p className="text-xs text-gray-500 mb-2">{it.description}</p>
              <span className="inline-block bg-violet-50 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {it.costTokens} tokens
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
