import { useState, type ChangeEvent } from "react";
import { Heart, Eye, EyeOff } from "lucide-react";
import { FormField, inputCls } from "../../components/FormField";
import { cls, calculateAge, formatDOB } from "../../utils/helpers";
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

interface Strength { label: string; colour: string; width: string }
function strengthOf(pw: string): Strength | null {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak",   colour: "bg-red-500",    width: "w-1/4" };
  if (score === 2) return { label: "Fair",   colour: "bg-yellow-500", width: "w-2/4" };
  if (score === 3) return { label: "Good",   colour: "bg-blue-500",   width: "w-3/4" };
  return             { label: "Strong", colour: "bg-green-500",  width: "w-full" };
}

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  showStrength?: boolean;
}

function PasswordInput({ id, value, onChange, placeholder, error, showStrength = false }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const s = showStrength ? strengthOf(value) : null;
  return (
    <div>
      <div className="relative">
        <input
          id={id} type={visible ? "text" : "password"} value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls(inputCls, "pr-14", error && "border-red-400")}
        />
        <button type="button" onClick={() => setVisible(v => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 min-h-[48px] min-w-[48px] flex items-center justify-center">
          {visible ? <EyeOff size={22} /> : <Eye size={22} />}
        </button>
      </div>
      {showStrength && value && s && (
        <div className="mt-2">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={cls("h-full rounded-full transition-all duration-300", s.colour, s.width)} />
          </div>
          <p className={cls(
            "text-sm mt-1 font-semibold",
            s.label === "Weak"   && "text-red-500",
            s.label === "Fair"   && "text-yellow-600",
            s.label === "Good"   && "text-blue-600",
            s.label === "Strong" && "text-green-600",
          )}>{s.label} password</p>
        </div>
      )}
    </div>
  );
}

export default function SignUp({ onSignedUp, onBackToLogin }: SignUpProps) {
  const [form, setForm] = useState<FormState>({
    name: "", dateOfBirth: "", email: "", height: "", weight: "", gender: "male",
    password: "", confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

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
    const heightN = Number(form.height);
    const weightN = Number(form.weight);
    if (!form.height || heightN < 100 || heightN > 250) e.height = "Please enter your height in cm.";
    if (!form.weight || weightN < 20 || weightN > 300)  e.weight = "Please enter your weight in kg.";
    if (!form.gender)                                   e.gender = "Please select your gender.";
    if (!form.password || form.password.length < 8)     e.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword)         e.confirmPassword = "Passwords do not match.";
    return e;
  };

  const handleSubmit = async (): Promise<void> => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const user = await userApi.register({
        name: form.name, email: form.email, dateOfBirth: form.dateOfBirth,
        gender: form.gender, height: Number(form.height), weight: Number(form.weight),
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

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 max-w-lg mx-auto">
        <FormField label="Full Name" id="name" error={errors.name}>
          <input id="name" type="text" value={form.name}
            onChange={e => set("name", e.target.value)} placeholder="e.g. Tan Ah Kow"
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

        <FormField label="Email Address" id="email" error={errors.email}>
          <input id="email" type="email" value={form.email}
            onChange={e => set("email", e.target.value)} placeholder="you@example.com"
            className={cls(inputCls, errors.email && "border-red-400")} />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Height (cm)" id="height" error={errors.height}>
            <input id="height" type="number" value={form.height} min={100} max={250}
              onChange={e => set("height", e.target.value)} placeholder="e.g. 162"
              className={cls(inputCls, errors.height && "border-red-400")} />
          </FormField>
          <FormField label="Weight (kg)" id="weight" error={errors.weight}>
            <input id="weight" type="number" value={form.weight} min={20} max={300}
              onChange={e => set("weight", e.target.value)} placeholder="e.g. 65"
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

        <FormField label="Password" id="password" error={errors.password}>
          <PasswordInput id="password" value={form.password}
            onChange={v => set("password", v)} placeholder="At least 8 characters"
            error={errors.password} showStrength />
        </FormField>

        <FormField label="Confirm Password" id="confirmPassword" error={errors.confirmPassword}>
          <PasswordInput id="confirmPassword" value={form.confirmPassword}
            onChange={v => set("confirmPassword", v)} placeholder="Re-enter your password"
            error={errors.confirmPassword} />
        </FormField>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-base mb-4">
            {submitError}
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="w-full bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-60 text-white text-xl font-bold py-4 rounded-2xl min-h-[60px] transition-all shadow-lg shadow-violet-200">
          {submitting ? "Creating your profile…" : "Create Profile & Continue"}
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
