import { TESTS } from "../../utils/constants";
import type { TestId } from "../../types";

export function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function labelForTest(id: TestId): string {
  return TESTS.find(t => t.id === id)?.name ?? id;
}

export function calcAge(dob: string | undefined): number | null {
  if (!dob) return null;
  const t = new Date(); const b = new Date(dob);
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}
