import { Check, FileText, Shield, X } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { latestConsentByScope } from "../ClientShared";
import type { ConsentEvent, ConsentScope } from "../../../types";

interface RecordsProps {
  consents: ConsentEvent[];
}

const SCOPE_LABEL: Record<ConsentScope, string> = {
  assessment_data: "Storing my Assessment Results",
  clinician_share: "Sharing my Assessment Results with my Clinician",
  research:        "Use of my Anonymised Data for Research",
  third_party:     "Sharing with third-party providers",
  institutional:   "Institutional Reporting",
};

// Grounded in the User schema and middleware/access.js - if either changes,
// this notice has to change with it.
const COLLECTED: ReadonlyArray<readonly [string, string]> = [
  ["Identity and Contact", "Your name, email, date of birth and gender. Your NRIC is kept only as a one-way hash plus its last four digits - full NRIC is never stored."],
  ["Health information",   "Your height and weight, your assessment results, and your questionnaire answers."],
  ["Activity",             "Sign-ins and changes made to your record, kept as an audit trail."],
];

const WHO_CAN_SEE: ReadonlyArray<readonly [string, string]> = [
  ["Your Clinician",  "Your profile and your assessment results, so they can plan your care."],
  ["Clinic Staff",    "Your profile and emergency contact only."],
  ["Administrators",  "Account records, for managing the platform."],
];

const longDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });

export default function Records({ consents }: RecordsProps) {
  // Same rule the save path uses, so what this screen shows and what the app
  // acts on can never disagree.
  const current = [...latestConsentByScope(consents).values()];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Shield size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">Your Personal Data</p>
          <p className="text-xs text-blue-800 mt-1 leading-relaxed">
            HANA handles your information under Singapore's Personal Data Protection Act.
            This page explains what is held, why, and who can see it.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Personal Data Collected</h3>
        <p className="text-xs text-gray-400 mb-4">
          Collected so your assessments can be run, scored against the right reference group, and
          reviewed by your clinician.
        </p>
        {COLLECTED.map(([heading, detail]) => (
          <div key={heading} className="py-2.5 border-b border-gray-50 last:border-0">
            <div className="text-sm font-medium text-gray-900">{heading}</div>
            <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{detail}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Access to Your Data</h3>
        {WHO_CAN_SEE.map(([who, what]) => (
          <div key={who} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="text-sm font-medium text-gray-900 w-32 flex-shrink-0">{who}</div>
            <div className="text-xs text-gray-500 flex-1 leading-relaxed">{what}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Data Sharing</h3>
        <p className="text-xs text-gray-400 mb-4">Recorded with the date you gave it.</p>
        {current.length === 0 ? (
          <p className="text-sm text-gray-400">
            You have not been asked for any permissions yet. You will be asked before your first
            assessment is saved.
          </p>
        ) : current.map(event => (
          <div key={event.scope} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
            <div className={cls(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
              event.granted ? "bg-green-50" : "bg-gray-100",
            )}>
              {event.granted
                ? <Check size={15} className="text-green-600" />
                : <X size={15} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{SCOPE_LABEL[event.scope]}</div>
              <div className="text-xs text-gray-400">
                {event.granted ? "Allowed" : "Withdrawn"} on {longDate(event.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <FileText size={15} className="text-blue-500" /> Your Rights
        </h3>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          You may ask for a copy of what is held about you, ask for anything incorrect to be put
          right, or withdraw a permission you have given. You can correct your own details at any
          time under Account. For anything else, speak to your clinic - every change is recorded
          with the date and who made it.
        </p>
      </div>
    </div>
  );
}
