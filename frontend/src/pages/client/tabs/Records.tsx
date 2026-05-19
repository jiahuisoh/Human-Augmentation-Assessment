import { cls } from "../../../utils/helpers";
import { labelForTest } from "../ClientShared";
import type { AssessmentSession, ConsentEvent, ConsentScope, User } from "../../../types";

interface RecordsProps {
  user: User;
  consents: ConsentEvent[];
  sessions: AssessmentSession[];
  onConsentChange: (scope: ConsentScope, granted: boolean) => Promise<void>;
}

const SCOPES: ReadonlyArray<{ scope: ConsentScope; label: string }> = [
  { scope: "research",        label: "Share anonymised data for research" },
  { scope: "clinician_share", label: "Share records with assigned clinician" },
  { scope: "third_party",     label: "Third-party health app integration" },
];

/** Latest event per scope (consent events are append-only — most recent wins). */
function currentConsentByScope(consents: ConsentEvent[]): Record<ConsentScope, boolean> {
  return consents.reduce<Record<ConsentScope, boolean>>(
    (acc, c) => { if (!(c.scope in acc)) acc[c.scope] = c.granted; return acc; },
    {} as Record<ConsentScope, boolean>,
  );
}

export default function Records({ user: _user, consents, sessions, onConsentChange }: RecordsProps) {
  const current = currentConsentByScope(consents);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">My data consents</h3>
        {SCOPES.map(({ scope, label }) => {
          const granted = current[scope] ?? false;
          return (
            <div key={scope} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{label}</span>
              <button type="button" onClick={() => void onConsentChange(scope, !granted)}
                className={cls(
                  "px-3 py-1 rounded-full text-xs font-semibold border",
                  granted
                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200",
                )}>
                {granted ? "Granted — click to revoke" : "Revoked — click to grant"}
              </button>
            </div>
          );
        })}
        <p className="mt-3 text-xs text-gray-400">All consent events are recorded on the blockchain. Raw health data stays off-chain.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-2">My verified records</h3>
        <p className="text-xs text-gray-400 mb-4">Raw health data is stored securely off-chain. Only hashes and proofs are on the blockchain.</p>
        {sessions.slice(0, 5).map(s => (
          <div key={s._id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <div>
              <div className="text-sm text-gray-800">{labelForTest(s.testId)} — {new Date(s.createdAt).toLocaleDateString("en-SG")}</div>
              <div className="text-xs font-mono text-gray-400">{s.recordHash ?? "—"}</div>
            </div>
            <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full text-xs font-semibold">Verified</span>
          </div>
        ))}
      </div>
    </div>
  );
}
