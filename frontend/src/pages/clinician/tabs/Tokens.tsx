import { useState } from "react";
import { Coins } from "lucide-react";
import type { PatientView } from "../ClinicianShared";

interface TokensProps {
  patients: PatientView[];
  onIssue: (clientId: string, amount: number, reason: string) => Promise<void>;
}

export default function Tokens({ patients, onIssue }: TokensProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Issue clinical milestone tokens</h3>
        <p className="text-xs text-gray-400 mb-4">
          Tokens you issue for clinical milestones to your assigned patients. Amounts over 100 tokens
          automatically route to an administrator for approval.
        </p>
        {patients.map(p => <Row key={p.user._id} patient={p} onIssue={onIssue} />)}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        Tokens are non-transferable and non-financial. High-value rewards require administrator approval.
      </div>
    </div>
  );
}

interface RowProps {
  patient: PatientView;
  onIssue: (clientId: string, amount: number, reason: string) => Promise<void>;
}

function Row({ patient, onIssue }: RowProps) {
  const [amount, setAmount] = useState("25");
  const [reason, setReason] = useState("");
  const [busy, setBusy]     = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      await onIssue(patient.user._id, Number(amount), reason);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{patient.user.name}</div>
        <div className="text-xs text-gray-400">Balance: {patient.tokenBalance} tokens</div>
      </div>
      <div className="flex items-center gap-2">
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          className="w-20 px-2 py-1.5 border border-gray-200 rounded text-xs" />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for milestone"
          className="w-48 px-2 py-1.5 border border-gray-200 rounded text-xs" />
        <button type="button" disabled={!Number(amount) || !reason.trim() || busy} onClick={() => void submit()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
          <Coins size={12} /> Issue
        </button>
      </div>
    </div>
  );
}
