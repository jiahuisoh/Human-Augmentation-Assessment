/** Conditional class-name builder — returns space-separated truthy strings. */
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

export function initialsOf(name?: string): string {
  if (!name) return "U";
  return name.split(/\s+/).map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export function firstNameOf(name?: string): string {
  if (!name) return "there";
  return name.split(/\s+/)[0] ?? name;
}

/**
 * Singapore NRIC/FIN validation: format plus the official checksum
 * (weighted digit sum, series offset, series-specific letter table).
 * Mirrors the backend check in backend/src/utils/validators.js.
 */
const NRIC_WEIGHTS = [2, 7, 6, 5, 4, 3, 2] as const;
const NRIC_TABLES: Record<string, string> = {
  S: "JZIHGFEDCBA", T: "JZIHGFEDCBA",
  F: "XWUTRQPNMLK", G: "XWUTRQPNMLK",
  M: "KLJNPQRTUWX",
};
export function isValidNric(value: string): boolean {
  const nric = value.trim().toUpperCase();
  if (!/^[STFGM]\d{7}[A-Z]$/.test(nric)) return false;
  const series = nric[0];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(nric[i + 1]) * NRIC_WEIGHTS[i];
  if (series === "T" || series === "G") sum += 4;
  if (series === "M") sum += 3;
  const r = sum % 11;
  const expected = series === "M" ? NRIC_TABLES.M[10 - r] : NRIC_TABLES[series][r];
  return nric[8] === expected;
}
