import { cls, calculateAge, formatDOB } from "../utils/helpers";
import { EmergencyContactSection } from "./EmergencyContact";
import type { EmergencyContact, User } from "../types";

const STATUS_STYLES: Record<User["verificationStatus"], string> = {
  verified:   "bg-green-50 text-green-700 border-green-200",
  pending:    "bg-amber-50 text-amber-700 border-amber-200",
  unverified: "bg-gray-50 text-gray-500 border-gray-200",
  suspended:  "bg-red-50 text-red-600 border-red-200",
};

interface ClientProfileProps {
  user: User;
  /** Enables the emergency-contact pencil (staff assisting a client).
   *  Omit for read-only views (clinician). */
  onSaveEmergencyContact?: (contact: EmergencyContact) => Promise<void>;
  accent?: "violet" | "teal";
}

// Read-only client profile summary shared by the clinician patient view and
// the staff client list: demographics, measurements and the emergency
// contact. Never clinical data — sessions and plans are gated separately.
export function ClientProfile({ user, onSaveEmergencyContact, accent = "violet" }: ClientProfileProps) {
  const age = calculateAge(user.dateOfBirth);
  const rows: ReadonlyArray<readonly [string, string, string?]> = [
    ["Full Name",     user.name],
    ["Email",         user.email, "break-all"],
    ["Date Of Birth", user.dateOfBirth ? formatDOB(user.dateOfBirth) : "—"],
    ["Age",           age !== null ? `${age} years` : "—"],
    ["Gender",        user.gender ?? "—", "capitalize"],
    ["NRIC",          user.nricLastFour ? `•••••${user.nricLastFour}` : "—", "font-mono tracking-wider"],
    ["Height",        user.height != null ? `${user.height} cm` : "—"],
    ["Weight",        user.weight != null ? `${user.weight} kg` : "—"],
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {rows.map(([label, value, extra]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-gray-500 mb-0.5">{label}</dt>
            <dd className={cls("text-sm font-semibold text-gray-900", extra)}>{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs font-medium text-gray-500 mb-1">Verification Status</dt>
          <dd>
            <span className={cls(
              "inline-block px-2 py-0.5 rounded-full text-xs font-semibold border capitalize",
              STATUS_STYLES[user.verificationStatus],
            )}>
              {user.verificationStatus}
            </span>
          </dd>
        </div>
      </dl>

      <div className="pt-4 border-t border-gray-100">
        <EmergencyContactSection contact={user.emergencyContact}
          onSave={onSaveEmergencyContact} accent={accent} />
      </div>
    </div>
  );
}
