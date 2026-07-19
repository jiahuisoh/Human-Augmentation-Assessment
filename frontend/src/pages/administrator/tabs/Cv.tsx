import { AlertTriangle, Camera } from "lucide-react";
import type { ScheduleEntry, TestId } from "../../../types";

interface CvProps {
  schedule: ScheduleEntry[];
  authorised: boolean;
  onAuthorise: (v: boolean) => void;
  onLaunch: (clientId: string, testId: TestId) => void;
}

// Per HANA doc: admin can conduct functional assessments
// "Yes, if clinically authorised" - every session writes a WARN-level audit.
export default function Cv({ schedule, authorised, onAuthorise, onLaunch }: CvProps) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-3">
        <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold mb-1">CV access for administrators is gated</div>
          <p>
            Per HANA CRM doc (Functional Health Assessment matrix), administrators may conduct functional
            assessments only "if clinically authorised". Every CV session you launch is logged with WARN-level
            audit context and the clinical authorisation flag.
          </p>
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={authorised} onChange={e => onAuthorise(e.target.checked)} />
            <span>I confirm clinical authorisation for this CV session</span>
          </label>
        </div>
      </div>

      {authorised ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Launch CV for scheduled clients</h3>
          {schedule.map(s => (
            <div key={s._id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div>
                <div className="text-sm text-gray-900">{s.clientName}</div>
                <div className="text-xs text-gray-500">{s.time} · {s.testId.replace(/_/g, " ")}</div>
              </div>
              <button type="button" onClick={() => onLaunch(s.clientId, s.testId)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg">
                <Camera size={12} /> Launch CV
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          CV launch disabled until you confirm clinical authorisation above.
        </div>
      )}
    </div>
  );
}
