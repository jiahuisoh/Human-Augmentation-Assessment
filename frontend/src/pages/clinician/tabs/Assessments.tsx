import { Camera } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { TESTS } from "../../../utils/constants";
import RiskBadge from "../../../components/RiskBadge";
import { riskFromSessions, type PatientView } from "../ClinicianShared";
import type { TestId } from "../../../types";

interface AssessmentsProps {
  patients: PatientView[];
  onLaunchCV: (clientId: string, testId: TestId) => void;
}

export default function Assessments({ patients, onLaunchCV }: AssessmentsProps) {
  return (
    <div className="space-y-5">
      <LiveLaunch patients={patients} onLaunchCV={onLaunchCV} />
    </div>
  );
}

interface LiveLaunchProps {
  patients: PatientView[];
  onLaunchCV: (clientId: string, testId: TestId) => void;
}

function LiveLaunch({ patients, onLaunchCV }: LiveLaunchProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Camera size={15} className="text-violet-600" /> Conduct Live Assessment
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        For in-clinic sessions. Frames stream to the HANA CV service for analysis; results are recorded with a timestamp.
      </p>
      <div className="space-y-3">
        {patients.map(p => (
          <div key={p.user._id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-900">{p.user.name}</div>
              <RiskBadge level={riskFromSessions(p.sessions)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TESTS.map(t => (
                <button key={t.id} type="button" onClick={() => onLaunchCV(p.user._id, t.id)}
                  className={cls(
                    "text-left bg-violet-50 hover:bg-violet-100 transition-colors rounded-lg p-3 border border-violet-100",
                  )}>
                  <t.Icon size={18} className="text-violet-600 mb-1.5" />
                  <div className="text-xs font-semibold text-violet-700">{t.name}</div>
                  <div className="text-xs text-violet-500 flex items-center gap-1 mt-1"><Camera size={10} /> Launch CV</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
