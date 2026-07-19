import { useEffect, useState, type ChangeEvent } from "react";
import { Eye, EyeOff, Circle, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cls } from "../utils/helpers";
import { inputCls } from "./FormField";
import { passwordReqs, strengthLevel, checkHIBP, type StrengthLevel } from "../utils/passwordStrength";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  /** Overrides the default signup-sized input styling (e.g. compact cards). */
  className?: string;
}

export function PasswordInput({ id, value, onChange, error, className }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} type={visible ? "text" : "password"} value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className={cls(className ?? inputCls, "pr-14", error && "border-red-400")}
      />
      <button type="button" onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 min-h-[48px] min-w-[48px] flex items-center justify-center">
        {visible ? <EyeOff size={22} /> : <Eye size={22} />}
      </button>
    </div>
  );
}

// Breach banner, requirements checklist and strength meter for a password
// field, rendered full-width below it. Shared by signup and change-password.
export function PasswordFeedback({ value, userInputs }: { value: string; userInputs: string[] }) {
  const [level, setLevel] = useState<StrengthLevel | null>(null);
  const [breached, setBreached] = useState(false);

  useEffect(() => {
    setBreached(false); // check runs silently; only a positive hit is shown
    if (!value) { setLevel(null); return; }
    let cancelled = false;
    void strengthLevel(value, userInputs).then(l => { if (!cancelled) setLevel(l); });
    // The HIBP query is debounced so it fires once the user pauses typing.
    const t = window.setTimeout(() => {
      void checkHIBP(value).then(b => { if (!cancelled) setBreached(b); });
    }, 500);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [value, userInputs]);

  const reqs = passwordReqs(value);
  const reqRows: ReadonlyArray<readonly [string, boolean]> = [
    ["At least 8 characters", reqs.length],
    ["At least 1 letter",     reqs.letter],
    ["At least 1 digit",      reqs.digit],
  ];

  return (
    <div className="mb-4">
      {breached && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5 mb-3">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            Password appeared in a data breach. Consider choosing a different password.
          </p>
        </div>
      )}
      <p className="text-sm font-semibold text-gray-900 mb-1.5">Password Requirements</p>
      <ul className="space-y-1">
        {reqRows.map(([label, pass]) => (
          <li key={label} className={cls(
            "flex items-center gap-2 text-sm",
            !value ? "text-gray-400" : pass ? "text-green-600" : "text-red-500",
          )}>
            {!value ? <Circle size={14} /> : pass ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {label}
          </li>
        ))}
      </ul>
      {value && level && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-500">Strength</span>
            <span className={cls("text-sm font-semibold", level.textCls)}>{level.text}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={cls("h-full rounded-full transition-all duration-300", level.bar)}
              style={{ width: `${level.pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
