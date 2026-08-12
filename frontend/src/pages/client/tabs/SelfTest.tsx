import { useState } from "react";
import { Camera, ChevronRight, ArrowLeft, AlertTriangle } from "lucide-react";
import { TESTS } from "../../../utils/constants";
import type { TestId } from "../../../types";

interface SelfTestProps {
  onStart: (testId: TestId) => void;
}

export default function SelfTest({ onStart }: SelfTestProps) {
  const cvTests = TESTS.filter(t => t.cvEnabled);
  const [selectedId, setSelectedId] = useState<TestId | null>(null);
  const selected = cvTests.find(t => t.id === selectedId) ?? null;

  if (selected) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setSelectedId(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft size={15} /> All assessments
        </button>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
              <selected.Icon size={24} className="text-violet-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
              <p className="text-sm text-gray-400">{selected.shortDesc}</p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              How to perform the test
            </h3>
            <ol className="space-y-3">
              {selected.instructions.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-violet-200 text-violet-700 text-xs font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">{selected.safetyNote}</p>
          </div>
        </div>

        <button type="button" onClick={() => onStart(selected.id)}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-3.5 rounded-xl shadow-sm transition-colors">
          <Camera size={17} /> Start {selected.name}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Choose an Assessment</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Run a guided functional test on your own and share the result with your clinician.
        </p>
      </div>

      <div className="space-y-3">
        {cvTests.map(t => (
          <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
            className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:border-violet-200 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
              <t.Icon size={22} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
              <p className="text-xs text-gray-400">{t.shortDesc}</p>
            </div>
            <span className="hidden sm:inline-flex text-xs font-medium text-gray-400 bg-gray-50 rounded-full px-2.5 py-1">
              {t.metricLabel}
            </span>
            <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
