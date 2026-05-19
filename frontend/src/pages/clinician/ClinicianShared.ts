import type { AssessmentSession, InterventionPlan, RiskLevel, User } from "../../types";

export interface PatientView {
  user: User;
  sessions: AssessmentSession[];
  plan: InterventionPlan | null;
  tokenBalance: number;
}

/** Age from an ISO yyyy-mm-dd birth date. Defaults to 0 if absent. */
export function calcAge(dob: string | undefined): number {
  if (!dob) return 0;
  const t = new Date(); const b = new Date(dob);
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}

/** Adherence % — done items vs total in the active plan. */
export function adherenceOf(plan: InterventionPlan | null): number {
  if (!plan || plan.items.length === 0) return 0;
  return Math.round((plan.items.filter(i => i.done).length / plan.items.length) * 100);
}

/** Latest session's risk level, or "moderate" as a safe default. */
export function riskFromSessions(sessions: AssessmentSession[]): RiskLevel {
  return sessions[0]?.riskLevel ?? "moderate";
}
