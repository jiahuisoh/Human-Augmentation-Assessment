import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cls } from "../../../utils/helpers";
import type { FAQEntry } from "../data/helpContent";

interface FAQAccordionProps {
  faqs: ReadonlyArray<FAQEntry>;
}

export default function FAQAccordion({ faqs }: FAQAccordionProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {faqs.map((f, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={i} className={cls("border rounded-xl overflow-hidden", isOpen ? "border-violet-300" : "border-gray-200")}>
            <button type="button" onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-white hover:bg-gray-50">
              <span className={cls("text-sm font-medium", isOpen ? "text-violet-700" : "text-gray-900")}>
                {f.q}
              </span>
              {isOpen
                ? <ChevronUp   size={16} className="text-violet-600 flex-shrink-0" />
                : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
              }
            </button>
            {isOpen && (
              <div className="px-4 py-3 bg-violet-50 border-t border-violet-100">
                <p className="text-xs text-gray-700 leading-relaxed">{f.a}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
