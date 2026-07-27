/** Conditional class-name builder - returns space-separated truthy strings. */
export function cls(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(" ");
}

export function calculateAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** Format an ISO date as "15 May 1958". Empty string on falsy input. */
export function formatDOB(dateOfBirth?: string | null): string {
  if (!dateOfBirth) return "";
  return new Date(dateOfBirth).toLocaleDateString("en-SG", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Audit/log stamp: "27 Jul 2026, 14:32". Both log views span more than one day,
 * so a bare clock time is ambiguous - the date has to be on the row.
 */
export function formatLogStamp(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-SG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/**
 * Today as "YYYY-MM-DD" in the browser's own timezone - the same calendar day
 * the backend stores for a booking. "en-CA" is the locale whose short date
 * format is already ISO.
 */
export function todayIso(): string {
  return isoDateIn(0);
}

/** A calendar date `days` from now as "YYYY-MM-DD"; handles month and year rollover. */
export function isoDateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

/**
 * Current wall-clock time as 24-hour "HH:MM", matching the format a booking
 * stores. hourCycle "h23" rather than hour12:false - several locales answer the
 * latter with a 1-24 clock, rendering midnight as "24:00", which would sort
 * after every other time of day.
 */
export function nowHhMm(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
}

export function initialsOf(name?: string): string {
  if (!name) return "U";
  return name.split(/\s+/).map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export function firstNameOf(name?: string): string {
  if (!name) return "there";
  return name.split(/\s+/)[0] ?? name;
}

/**
 * Singapore phone number: 8 digits starting with 6, 8 or 9 after stripping
 * whitespace; an optional +65 prefix is accepted so stored values round-trip.
 * Returns the normalized "+65XXXXXXXX" form, or null when invalid.
 * Mirrors backend/src/utils/validators.js.
 */
export function normalizeSgPhone(phone: string): string | null {
  const p = phone.replace(/\s+/g, "");
  const m = /^(?:\+65)?([689]\d{7})$/.exec(p);
  return m ? `+65${m[1]}` : null;
}

/**
 * Singapore NRIC/FIN validation, per the "NRIC Checksum to Suffix" table:
 * checksum = weighted digit sum mod 11, suffix = series row[checksum].
 * Each row already encodes its series offset; M row is the same scheme
 * for FINs issued from 2022. Mirrors backend/src/utils/validators.js.
 */
const NRIC_WEIGHTS = [9, 4, 5, 6, 7, 8, 9] as const;
const NRIC_TABLES: Record<string, string> = {
  S: "JABCDEFGHIZ",
  T: "GHIZJABCDEF",
  F: "XKLMNPQRTUW",
  G: "RTUWXKLMNPQ",
  M: "TUWXKLJNPQR",
};
export function isValidNric(value: string): boolean {
  const nric = value.trim().toUpperCase();
  if (!/^[STFGM]\d{7}[A-Z]$/.test(nric)) return false;
  let checksum = 0;
  for (let i = 0; i < 7; i++) checksum += Number(nric[i + 1]) * NRIC_WEIGHTS[i];
  return nric[8] === NRIC_TABLES[nric[0]][checksum % 11];
}
