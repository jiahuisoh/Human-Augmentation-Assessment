import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { questionnaireApi } from "../../../utils/api";
import { QUESTIONNAIRE } from "../data/questionnaireSchema";
import type { QuestionnaireAnswer, User } from "../../../types";

interface QuestionnaireProps {
  user: User;
}

export default function Questionnaire({ user }: QuestionnaireProps) {
  const [answers, setAnswers]       = useState<Record<string, QuestionnaireAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true): void => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3500);
  };

  const setAnswer = (id: string, value: QuestionnaireAnswer): void => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const allAnswered = QUESTIONNAIRE.every(q => q.id in answers);

  const submit = async (): Promise<void> => {
    if (!allAnswered) { showToast("Please answer every question.", false); return; }
    setSubmitting(true);
    try {
      await questionnaireApi.submit({
        clientId: user._id,
        answers: answers as Record<string, number | boolean>,
      });
      setAnswers({});
      showToast("Self-report submitted. Thank you.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Submission failed.", false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className={cls(
          "fixed top-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg",
          toast.ok ? "bg-green-600" : "bg-red-600",
        )}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Self-reported questionnaire</h3>
        <p className="text-xs text-gray-400 mb-4">
          A quick check-in for your clinician. None of this replaces an assessment — it's a snapshot of how you feel today.
        </p>

        <div className="space-y-4">
          {QUESTIONNAIRE.map(q => (
            <div key={q.id}>
              <label className="block text-sm font-medium text-gray-800 mb-2">{q.prompt}</label>
              {q.kind === "scale_1_5" && <Scale id={q.id} value={answers[q.id] as number | undefined} onChange={v => setAnswer(q.id, v)} />}
              {q.kind === "yes_no"     && <YesNo id={q.id} value={answers[q.id] as boolean | undefined} onChange={v => setAnswer(q.id, v)} />}
              {q.kind === "minutes"    && <Minutes id={q.id} value={answers[q.id] as number | undefined} onChange={v => setAnswer(q.id, v)} />}
            </div>
          ))}
        </div>

        <button type="button" onClick={() => void submit()} disabled={!allAnswered || submitting}
          className="w-full mt-5 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
          <CheckCircle size={14} /> {submitting ? "Submitting…" : "Submit self-report"}
        </button>
      </div>
    </div>
  );
}

interface ScaleProps { id: string; value?: number; onChange: (v: number) => void }
function Scale({ id, value, onChange }: ScaleProps) {
  return (
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby={id}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={cls(
            "py-2 rounded-lg text-sm font-semibold border transition-all",
            value === n
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-gray-700 border-gray-200 hover:border-violet-300",
          )}>
          {n}
        </button>
      ))}
    </div>
  );
}

interface YesNoProps { id: string; value?: boolean; onChange: (v: boolean) => void }
function YesNo({ id, value, onChange }: YesNoProps) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={id}>
      {[
        { label: "Yes", v: true  },
        { label: "No",  v: false },
      ].map(o => (
        <button key={o.label} type="button" onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={cls(
            "py-2 rounded-lg text-sm font-semibold border transition-all",
            value === o.v
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-gray-700 border-gray-200 hover:border-violet-300",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface MinutesProps { id: string; value?: number; onChange: (v: number) => void }
function Minutes({ id, value, onChange }: MinutesProps) {
  return (
    <input id={id} type="number" min={0} max={600} value={value ?? ""}
      onChange={e => onChange(Number(e.target.value))}
      placeholder="e.g. 25"
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
  );
}
