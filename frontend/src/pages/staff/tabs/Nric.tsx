import { useState } from "react";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { isValidNric } from "../../../utils/helpers";
import type { PendingVerificationClient } from "../../../types";

interface NricProps {
  clients: PendingVerificationClient[];
  onVerify: (clientId: string, nric: string) => Promise<boolean>;
}

export default function Nric({ clients, onVerify }: NricProps) {
  // Not yet checked (or sent back by an admin) — these need staff action now.
  const toCheck = clients.filter(c => c.verificationStatus === "unverified");
  // Checked and sitting with the admin for approval.
  const awaitingAdmin = clients.filter(c => c.verificationStatus === "pending");

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Awaiting NRIC check
          {toCheck.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400">· {toCheck.length}</span>}
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Sight the client's physical NRIC and enter it in full. The result goes to an administrator,
          who gives the final approval. Accounts are never verified directly from here.
        </p>
        {toCheck.length === 0
          ? <p className="text-sm text-gray-400">No clients are waiting for an NRIC check.</p>
          : toCheck.map(c => <NricRow key={c._id} client={c} onVerify={onVerify} />)}
      </div>

      {awaitingAdmin.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            With administrator <span className="ml-1 text-xs font-normal text-gray-400">· {awaitingAdmin.length}</span>
          </h3>
          <p className="text-xs text-gray-400 mb-4">Checked by staff, awaiting the administrator's decision.</p>
          {awaitingAdmin.map(c => (
            <div key={c._id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
              <span className="text-sm font-medium text-gray-900">{c.name}</span>
              {c.recommended ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                  <CheckCircle2 size={13} /> NRIC matched, pending approval
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                  <AlertTriangle size={13} /> NRIC did not match, flagged for review
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        All NRIC checks are logged with timestamp and staff ID for audit. The NRIC itself is never stored in plain text.
      </div>
    </div>
  );
}

interface NricRowProps {
  client: PendingVerificationClient;
  onVerify: (clientId: string, nric: string) => Promise<boolean>;
}

function NricRow({ client, onVerify }: NricRowProps) {
  const [nric, setNric]             = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const valid = isValidNric(nric);

  const handleClick = async (): Promise<void> => {
    setSubmitting(true);
    setError("");
    try {
      await onVerify(client._id, nric.trim().toUpperCase());
      setNric("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // A client an admin has sent back was already checked once; call that out so
  // staff know this is a re-check rather than a first-time registration.
  const isRecheck = client.checked;

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{client.name}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1">
            {isRecheck
              ? <><AlertTriangle size={11} className="text-amber-500" /> Sent back by administrator, re-check required</>
              : <><Clock size={11} /> Registered {new Date(client.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}</>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input value={nric}
            onChange={e => setNric(e.target.value.toUpperCase().slice(0, 9))}
            placeholder="Full NRIC e.g. S1234567D"
            className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:border-teal-500 focus:outline-none" />
          <button type="button"
            disabled={!valid || submitting}
            onClick={() => void handleClick()}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
            {submitting ? "…" : "Check"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5 text-right">{error}</p>}
    </div>
  );
}
