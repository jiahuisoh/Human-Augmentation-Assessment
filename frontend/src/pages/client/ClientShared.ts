import { TESTS } from "../../utils/constants";
import type { ConsentEvent, ConsentScope, TestId } from "../../types";

/**
 * Consent is an append-only event log, so the standing position on a scope is
 * its MOST RECENT event - an older grant must never outvote a later withdrawal.
 * Mirrors consentService.latestForScope on the server, and is deliberately
 * order-independent so it cannot silently depend on how the API sorted.
 */
export function latestConsentByScope(events: ConsentEvent[]): Map<ConsentScope, ConsentEvent> {
  const latest = new Map<ConsentScope, ConsentEvent>();
  for (const event of events) {
    const held = latest.get(event.scope);
    // ISO 8601 strings compare chronologically, so no Date parsing is needed.
    if (!held || event.createdAt > held.createdAt) latest.set(event.scope, event);
  }
  return latest;
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
