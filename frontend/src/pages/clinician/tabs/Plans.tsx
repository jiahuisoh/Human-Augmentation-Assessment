import { useMemo, useState } from "react";
import { Edit3, Plus } from "lucide-react";
import RiskBadge from "../../../components/RiskBadge";
import { riskFromSessions, type PatientView } from "../ClinicianShared";
import type { InterventionPlanItem } from "../../../types";

interface PlansProps {
  patients: PatientView[];
  onSave: (clientId: string, items: InterventionPlanItem[]) => Promise<void>;
}

export default function Plans({ patients, onSave }: PlansProps) {
  return (
    <div className="space-y-4">
      {patients.map(p => <PlanEditor key={p.user._id} patient={p} onSave={items => onSave(p.user._id, items)} />)}
    </div>
  );
}

interface PlanEditorProps {
  patient: PatientView;
  onSave: (items: InterventionPlanItem[]) => Promise<void>;
}

function PlanEditor({ patient, onSave }: PlanEditorProps) {
  const [items, setItems]         = useState<InterventionPlanItem[]>(patient.plan?.items ?? []);
  const [activity, setActivity]   = useState("");
  const [frequency, setFrequency] = useState("");

  const dirty = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(patient.plan?.items ?? []),
    [items, patient.plan],
  );

  const add = (): void => {
    if (!activity.trim() || !frequency.trim()) return;
    setItems(prev => [...prev, { activity, frequency, done: false }]);
    setActivity(""); setFrequency("");
  };

  const remove = (i: number): void => setItems(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-900 text-sm">{patient.user.name}</span>
          <RiskBadge level={riskFromSessions(patient.sessions)} />
        </div>
        <button type="button" disabled={!dirty} onClick={() => void onSave(items)}
          className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 disabled:text-gray-400 font-medium">
          <Edit3 size={12} /> Save plan
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-600 flex-1">{it.activity} · {it.frequency}</span>
            <button type="button" onClick={() => remove(i)} className="text-xs text-red-500" aria-label={`Remove ${it.activity}`}>×</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={activity} onChange={e => setActivity(e.target.value)} placeholder="Activity"
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" />
        <input value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="Frequency"
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs" />
        <button type="button" onClick={add}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}
