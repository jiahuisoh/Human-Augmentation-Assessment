import { useState } from "react";
import type { ScheduleEntry } from "../../../types";

interface NricProps {
  schedule: ScheduleEntry[];
  onVerify: (clientId: string, last4: string) => Promise<void>;
}

export default function Nric({ schedule, onVerify }: NricProps) {
  const pending = schedule.filter(s => !s.nricVerified);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">NRIC verification</h3>
        <p className="text-xs text-gray-400 mb-4">
          Enter the last 4 digits of the client's NRIC.
          Per HANA CRM doc, this is the Staff role's primary identity-management responsibility.
        </p>
        {pending.length === 0
          ? <p className="text-sm text-gray-400">All scheduled clients are verified for today.</p>
          : pending.map(s => <NricRow key={s._id} entry={s} onVerify={onVerify} />)}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        All NRIC verifications are logged with timestamp and staff ID for audit.
      </div>
    </div>
  );
}

interface NricRowProps {
  entry: ScheduleEntry;
  onVerify: (clientId: string, last4: string) => Promise<void>;
}

function NricRow({ entry, onVerify }: NricRowProps) {
  const [last4, setLast4]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const valid = /^\d{4}$/.test(last4);

  const handleClick = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onVerify(entry.clientId, last4);
      setLast4("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{entry.clientName}</div>
        <div className="text-xs text-gray-400">{entry.time} · {entry.testId.replace(/_/g, " ")}</div>
      </div>
      <div className="flex items-center gap-2">
        <input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="•••• last 4"
          className="w-28 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:border-teal-500 focus:outline-none" />
        <button type="button"
          disabled={!valid || submitting}
          onClick={() => void handleClick()}
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
          {submitting ? "…" : "Verify"}
        </button>
      </div>
    </div>
  );
}
