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
