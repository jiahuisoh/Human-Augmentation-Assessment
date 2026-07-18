import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Heart, Eye, EyeOff, Circle, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { FormField, inputCls } from "../../components/FormField";
import { cls, calculateAge, formatDOB, isValidNric } from "../../utils/helpers";
import {
  passwordReqs, meetsPasswordReqs, strengthLevel, checkHIBP, type StrengthLevel,
} from "../../utils/passwordStrength";
import { userApi } from "../../utils/api";
import type { NewUserPayload, Sex, User } from "../../types";

interface SignUpProps {
  onSignedUp: (user: User) => void;
  onBackToLogin: () => void;
}

type FormState = Omit<NewUserPayload, "height" | "weight"> & {
  height: string;
  weight: string;
  confirmPassword: string;
};

const today  = new Date();
const MAX_DOB = today.toISOString().split("T")[0];
const MIN_DOB = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate()).toISOString().split("T")[0];

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

function PasswordInput({ id, value, onChange, error }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} type={visible ? "text" : "password"} value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className={cls(inputCls, "pr-14", error && "border-red-400")}
      />
      <button type="button" onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 min-h-[48px] min-w-[48px] flex items-center justify-center">
        {visible ? <EyeOff size={22} /> : <Eye size={22} />}
      </button>
    </div>
  );
}

// Breach banner, requirements checklist and strength meter for the main
// password field, rendered full-width below the password/confirm row.
function PasswordFeedback({ value, userInputs }: { value: string; userInputs: string[] }) {
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

export default function SignUp({ onSignedUp, onBackToLogin }: SignUpProps) {
  const [form, setForm] = useState<FormState>({
    name: "", dateOfBirth: "", email: "", height: "", weight: "", gender: "male",
    nric: "", password: "", confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [checkingPw, setCheckingPw] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Context words for the strength meter: a password built from the user's
  // own name or email should score as guessable.
  const pwContext = useMemo(() => [form.name, form.email], [form.name, form.email]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const previewAge = calculateAge(form.dateOfBirth);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Please enter your full name.";
    if (!form.dateOfBirth) {
      e.dateOfBirth = "Please enter your date of birth.";
    } else {
      const age = calculateAge(form.dateOfBirth);
      if (age === null || age < 18) e.dateOfBirth = "You must be at least 18 years old to register.";
      else if (age > 120)            e.dateOfBirth = "Please enter a valid date of birth.";
    }
    if (!form.email || !form.email.includes("@")) e.email = "Please enter a valid email address.";
    if (!isValidNric(form.nric ?? "")) {
      e.nric = "Please enter a valid Singapore NRIC or FIN, e.g. S1234567D.";
    }
    const heightN = Number(form.height);
    const weightN = Number(form.weight);
    if (!form.height || heightN < 100 || heightN > 200) e.height = "Please enter your height in cm.";
    if (!form.weight || weightN < 20 || weightN > 200)  e.weight = "Please enter your weight in kg.";
    if (!form.gender)                                   e.gender = "Please select your gender.";
    if (!meetsPasswordReqs(form.password))              e.password = "Password must be at least 8 characters and include a letter and a number.";
    if (form.password !== form.confirmPassword)         e.confirmPassword = "Passwords do not match.";
    return e;
  };

  const handleSubmit = async (): Promise<void> => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setCheckingPw(true);
    setSubmitError("");
    const breached = await checkHIBP(form.password);
    setCheckingPw(false);
    if (breached) {
      setErrors({ password: "This password has appeared in a data breach. Please choose a different one." });
      return;
    }

    setSubmitting(true);
    try {
      const user = await userApi.register({
        name: form.name, email: form.email, dateOfBirth: form.dateOfBirth,
        gender: form.gender, height: Number(form.height), weight: Number(form.weight),
        nric: (form.nric ?? "").trim().toUpperCase(),
        password: form.password,
      });
      onSignedUp(user);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
          <Heart size={30} className="text-white fill-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">Welcome to HANA</h1>
        <p className="text-lg text-gray-500 mt-2">Create your profile to begin your health journey.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 max-w-2xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <FormField label="Full Name" id="name" error={errors.name}>
            <input id="name" type="text" value={form.name}
              onChange={e => set("name", e.target.value)}
              className={cls(inputCls, errors.name && "border-red-400")} />
          </FormField>

          <FormField label="Date of Birth" id="dateOfBirth" error={errors.dateOfBirth}>
            <input id="dateOfBirth" type="date" value={form.dateOfBirth}
              min={MIN_DOB} max={MAX_DOB}
              onChange={e => set("dateOfBirth", e.target.value)}
              className={cls(inputCls, errors.dateOfBirth && "border-red-400")} />
            {previewAge !== null && !errors.dateOfBirth && (
              <p className="text-base text-violet-600 font-semibold mt-1.5">
                Age: {previewAge} years old <span className="text-gray-400 font-normal text-sm">({formatDOB(form.dateOfBirth)})</span>
              </p>
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <FormField label="NRIC / FIN" id="nric" error={errors.nric}>
            <input id="nric" type="text" value={form.nric ?? ""}
              maxLength={9} autoComplete="off" inputMode="text"
              onChange={e => set("nric", e.target.value.toUpperCase())}

              className={cls(inputCls, "uppercase tracking-widest", errors.nric && "border-red-400")} />
          </FormField>

          <FormField label="Email Address" id="email" error={errors.email}>
            <input id="email" type="email" value={form.email}
              onChange={e => set("email", e.target.value)}
              className={cls(inputCls, errors.email && "border-red-400")} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Height (cm)" id="height" error={errors.height}>
            <input id="height" type="number" value={form.height} min={100} max={200}
              onChange={e => set("height", e.target.value)}
              className={cls(inputCls, errors.height && "border-red-400")} />
          </FormField>
          <FormField label="Weight (kg)" id="weight" error={errors.weight}>
            <input id="weight" type="number" value={form.weight} min={20} max={200}
              onChange={e => set("weight", e.target.value)}
              className={cls(inputCls, errors.weight && "border-red-400")} />
          </FormField>
        </div>

        <FormField label="Gender" id="gender" error={errors.gender}>
          <div className="grid grid-cols-3 gap-3">
            {(["male", "female", "other"] as const).map(g => (
              <button key={g} type="button" onClick={() => set("gender", g as Sex)}
                className={cls(
                  "py-3 rounded-xl text-lg font-semibold border-2 min-h-[52px] transition-all capitalize",
                  form.gender === g
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-gray-700 border-gray-300 hover:border-violet-300",
                )}>
                {g}
              </button>
            ))}
          </div>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <FormField label="Password" id="password" error={errors.password}>
            <PasswordInput id="password" value={form.password}
              onChange={v => set("password", v)}
              error={errors.password} />
          </FormField>

          <FormField label="Confirm Password" id="confirmPassword" error={errors.confirmPassword}>
            <PasswordInput id="confirmPassword" value={form.confirmPassword}
              onChange={v => set("confirmPassword", v)}
              error={errors.confirmPassword} />
          </FormField>
        </div>

        <PasswordFeedback value={form.password} userInputs={pwContext} />

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-base mb-4">
            {submitError}
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={submitting || checkingPw}
          className="w-full bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-60 text-white text-xl font-bold py-4 rounded-2xl min-h-[60px] transition-all shadow-lg shadow-violet-200">
          {checkingPw ? "Checking password…" : submitting ? "Creating your profile…" : "Create Profile & Continue"}
        </button>
      </div>

      <p className="text-center text-lg text-gray-500">
        Already have an account?{" "}
        <button type="button" onClick={onBackToLogin}
          className="text-violet-600 font-semibold cursor-pointer hover:text-violet-800 underline underline-offset-2">
          Log In
        </button>
      </p>
    </div>
  );
}
