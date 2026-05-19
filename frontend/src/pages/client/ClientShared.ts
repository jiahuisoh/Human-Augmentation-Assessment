import { TESTS } from "../../utils/constants";
import type { TestId } from "../../types";

export function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function labelForTest(id: TestId): string {
  return TESTS.find(t => t.id === id)?.name ?? id;
}
