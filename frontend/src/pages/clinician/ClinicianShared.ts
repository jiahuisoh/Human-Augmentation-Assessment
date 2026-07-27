import type {
  AssessmentSession, AttendanceStatus, InterventionPlan, RiskLevel, ScheduleEntry, User,
} from "../../types";

export interface PatientView {
  user: User;
  sessions: AssessmentSession[];
  plan: InterventionPlan | null;
  schedule: ScheduleEntry[];
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  scheduled:   "Scheduled",
  present:     "Present",
  absent:      "Absent",
  in_progress: "In progress",
  completed:   "Completed",
};

export const STATUS_STYLE: Record<AttendanceStatus, string> = {
  scheduled:   "bg-gray-100 text-gray-500 border-gray-200",
  present:     "bg-green-50 text-green-700 border-green-200",
  absent:      "bg-red-50 text-red-700 border-red-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed:   "bg-green-50 text-green-700 border-green-200",
};

/** Chronological order for entries; date and time are both fixed-width. */
export const byDateTime = (a: ScheduleEntry, b: ScheduleEntry): number =>
  `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);

export function calcAge(dob: string | undefined): number {
  if (!dob) return 0;
  const t = new Date(); const b = new Date(dob);
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}

export function adherenceOf(plan: InterventionPlan | null): number {
  if (!plan || plan.items.length === 0) return 0;
  return Math.round((plan.items.filter(i => i.done).length / plan.items.length) * 100);
}

export function riskFromSessions(sessions: AssessmentSession[]): RiskLevel {
  return sessions[0]?.riskLevel ?? "moderate";
}
