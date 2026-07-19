// Password strength and hygiene checks for signup: NIST SP 800-63B style
// requirements, a zxcvbn strength meter, and a Have I Been Pwned
// breached-password check.

export interface PasswordReqs { length: boolean; letter: boolean; digit: boolean }

// Mirrors backend utils/validators.js strongPassword: 8+ chars, a letter and
// a digit. These are the hard requirements; the meter below is advisory only.
export const passwordReqs = (pw: string): PasswordReqs => ({
  length: pw.length >= 8,
  letter: /[A-Za-z]/.test(pw),
  digit:  /\d/.test(pw),
});

export const meetsPasswordReqs = (pw: string): boolean => {
  const r = passwordReqs(pw);
  return r.length && r.letter && r.digit;
};

export interface StrengthLevel { pct: number; bar: string; text: string; textCls: string }

const LEVELS: readonly StrengthLevel[] = [
  { pct: 5,   bar: "bg-red-600",     text: "Too Weak",    textCls: "text-red-600" },
  { pct: 25,  bar: "bg-red-600",     text: "Weak",        textCls: "text-red-600" },
  { pct: 50,  bar: "bg-amber-600",   text: "Fair",        textCls: "text-amber-600" },
  { pct: 80,  bar: "bg-emerald-600", text: "Strong",      textCls: "text-emerald-600" },
  { pct: 100, bar: "bg-emerald-600", text: "Very Strong", textCls: "text-emerald-600" },
];

// Passed to zxcvbn as context so app words and the user's own details score
// as guessable - "hana2026" or their own name cannot rate well.
const APP_WORDS = ["hana", "health", "assessment", "singapore"];

// zxcvbn is a ~400 KB dictionary bundle, so it loads on demand at first use;
// until it arrives the meter simply stays empty.
type Zxcvbn = (pw: string, userInputs?: string[]) => { score: 0 | 1 | 2 | 3 | 4 };
let zxcvbn: Zxcvbn | null = null;
let zxcvbnLoading: Promise<unknown> | null = null;

export async function strengthLevel(pw: string, userInputs: string[]): Promise<StrengthLevel> {
  if (!zxcvbn) {
    zxcvbnLoading ??= import("zxcvbn").then(m => {
      zxcvbn = (m as { default?: Zxcvbn }).default ?? (m as unknown as Zxcvbn);
    });
    await zxcvbnLoading;
  }
  const inputs = [...APP_WORDS, ...userInputs.map(s => s.trim()).filter(Boolean)];
  return LEVELS[(zxcvbn as Zxcvbn)(pw, inputs).score];
}

// HIBP k-anonymity range check: only the first 5 hex chars of the SHA-1 ever
// leave the browser, and Add-Padding hides which bucket matched. Fails open
// (returns false) on any error so signup never depends on a third party.
export async function checkHIBP(pw: string): Promise<boolean> {
  try {
    const data = new TextEncoder().encode(pw);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;

    const text = await res.text();
    return text.split("\n").some(line => {
      const [hash, count] = line.split(":");
      return hash.trim() === suffix && parseInt(count, 10) > 0;
    });
  } catch {
    return false;
  }
}
