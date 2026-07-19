import { useEffect, useMemo, useState } from "react";
import { Save, Pencil, X } from "lucide-react";
import { cls, calculateAge, formatDOB, isValidNric } from "../../../utils/helpers";
import { measurementApi, userApi } from "../../../utils/api";
import { EmergencyContactSection } from "../../../components/EmergencyContact";
import { PasswordInput, PasswordFeedback } from "../../../components/PasswordFields";
import { meetsPasswordReqs } from "../../../utils/passwordStrength";
import { BMICard, BMIChart, BMI_ZONES, calcBmi } from "../components/BMICard";
import type { EmergencyContact, Measurement, ProfileUpdate, Sex, User } from "../../../types";

const today   = new Date();
const MAX_DOB = today.toISOString().split("T")[0];
const MIN_DOB = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate()).toISOString().split("T")[0];

const compactInputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none";

interface AccountProps {
  user: User;
  onUserUpdate: (user: User) => void;
}

export default function Account({ user, onUserUpdate }: AccountProps) {
  const [height, setHeight]               = useState<string>(user.height?.toString() ?? "");
  const [weight, setWeight]               = useState<string>(user.weight?.toString() ?? "");
  const [measurements, setMeasurements]   = useState<Measurement[]>([]);
  const [savingMeas, setSavingMeas]       = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm]     = useState({ name: "", dateOfBirth: "", gender: "male" as Sex, nric: "" });
  const [profileErr, setProfileErr]       = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwForm, setPwForm]               = useState({ current: "", next: "", confirm: "" });
  const [pwErrors, setPwErrors]           = useState<Record<string, string>>({});
  const [changingPw, setChangingPw]       = useState(false);


  const pwContext = useMemo(() => [user.name, user.email], [user.name, user.email]);

  useEffect(() => { void measurementApi.listForClient(user._id).then(setMeasurements); }, [user._id]);

  const showToast = (msg: string, ok = true): void => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3000);
  };

  const bmi = calcBmi(Number(height), Number(weight));
  const age = calculateAge(user.dateOfBirth);

  const saveMeas = async (): Promise<void> => {
    const h = Number(height), w = Number(weight);
    if (h < 100 || h > 200 || w < 20 || w > 200) {
      showToast("Enter a valid height (100 to 200 cm) and weight (20 to 200 kg).", false);
      return;
    }
    setSavingMeas(true);
    try {
      const m = await measurementApi.save(user._id, h, w);
      setMeasurements(prev => [...prev, m]);
      showToast(`Saved. BMI ${m.bmi}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", false);
    } finally {
      setSavingMeas(false);
    }
  };

  const startEditProfile = (): void => {
    setProfileForm({ name: user.name, dateOfBirth: user.dateOfBirth ?? "", gender: user.gender ?? "male", nric: "" });
    setProfileErr("");
    setEditingProfile(true);
  };

  // Single pop-up save for the profile (basics + NRIC). Only what actually
  // changed is sent; the NRIC goes last because it resets verification.
  const saveProfile = async (): Promise<void> => {
    const name = profileForm.name.trim();
    if (!name) { setProfileErr("Please enter your name."); return; }
    if (profileForm.dateOfBirth) {
      const dobAge = calculateAge(profileForm.dateOfBirth);
      if (dobAge === null || dobAge < 18 || dobAge > 120) {
        setProfileErr("Please enter a valid date of birth (you must be 18 or older).");
        return;
      }
    }
    if (profileForm.nric && !isValidNric(profileForm.nric)) {
      setProfileErr("Please enter a valid Singapore NRIC or FIN, or leave the field blank.");
      return;
    }

    const basics: ProfileUpdate = {};
    if (name !== user.name)                                                    basics.name = name;
    if (profileForm.dateOfBirth && profileForm.dateOfBirth !== user.dateOfBirth) basics.dateOfBirth = profileForm.dateOfBirth;
    if (profileForm.gender !== user.gender)                                    basics.gender = profileForm.gender;
    const nricNext = profileForm.nric ? profileForm.nric.trim().toUpperCase() : null;

    if (Object.keys(basics).length === 0 && !nricNext) {
      setEditingProfile(false); // nothing changed
      return;
    }
    if (!window.confirm(
      "Save your profile changes?"
      + (nricNext
        ? "\n\nChanging your NRIC resets your verification: your features will be locked until staff re-check your NRIC at the clinic and an administrator approves it."
        : ""),
    )) return;

    setSavingProfile(true);
    setProfileErr("");
    try {
      if (Object.keys(basics).length > 0) onUserUpdate(await userApi.updateProfile(user._id, basics));
      if (nricNext)                       onUserUpdate(await userApi.updateNric(user._id, nricNext));
      setEditingProfile(false);
      showToast(nricNext ? "Profile updated. Please visit the clinic to verify your NRIC again" : "Profile updated");
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };


  const handleSaveContact = async (contactValue: EmergencyContact): Promise<void> => {
    const updated = await userApi.saveEmergencyContact(user._id, contactValue);
    onUserUpdate(updated);
    showToast("Emergency contact saved");
  };

  const changePassword = async (): Promise<void> => {
    const e: Record<string, string> = {};
    if (!pwForm.current) e.current = "Please enter your current password.";
    if (!meetsPasswordReqs(pwForm.next)) e.next = "Password must be at least 8 characters and include a letter and a number.";
    else if (pwForm.next === pwForm.current) e.next = "New password must be different from your current password.";
    if (pwForm.confirm !== pwForm.next) e.confirm = "Passwords do not match.";
    setPwErrors(e);
    if (Object.keys(e).length) return;

    setChangingPw(true);
    try {
      await userApi.changePassword(pwForm.current, pwForm.next, pwForm.confirm);
      setPwForm({ current: "", next: "", confirm: "" });
      showToast("Password changed. Other devices have been signed out.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to change password", false);
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className={cls(
          "fixed top-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg",
          toast.ok ? "bg-green-600" : "bg-red-600",
        )}>
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">Profile</h3>
          <button type="button" onClick={startEditProfile} title="Edit profile" aria-label="Edit profile"
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-violet-600 transition-colors">
            <Pencil size={14} />
          </button>
        </div>
        <Row label="Name"          value={user.name} />
        <Row label="Email"         value={user.email} />
        <Row label="Date of birth" value={user.dateOfBirth ? `${formatDOB(user.dateOfBirth)} · age ${age ?? "-"}` : "-"} />
        <div className="flex items-center justify-between py-2 border-b border-gray-50">
          <span className="text-sm text-gray-500">NRIC</span>
          <span className="text-sm text-gray-900 font-medium font-mono tracking-widest">
            {user.nricLastFour ? `•••••${user.nricLastFour}` : "-"}
          </span>
        </div>
        <Row label="Gender"        value={user.gender ?? "-"} />
      </div>

      {/* Edit-profile pop-up: everything except email and verification. */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Edit Profile</h3>
              <button type="button" onClick={() => setEditingProfile(false)} aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                <input id="prof-name" type="text" value={profileForm.name} maxLength={120}
                  onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                  className={compactInputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prof-dob" className="block text-xs font-medium text-gray-500 mb-1">Date of birth</label>
                  <input id="prof-dob" type="date" value={profileForm.dateOfBirth}
                    min={MIN_DOB} max={MAX_DOB}
                    onChange={e => setProfileForm(p => ({ ...p, dateOfBirth: e.target.value }))}
                    className={compactInputCls} />
                </div>
                <div>
                  <label htmlFor="prof-gender" className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                  <select id="prof-gender" value={profileForm.gender}
                    onChange={e => setProfileForm(p => ({ ...p, gender: e.target.value as Sex }))}
                    className={cls(compactInputCls, "capitalize")}>
                    {(["male", "female", "other"] as const).map(g => (
                      <option key={g} value={g} className="capitalize">{g}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="prof-nric" className="block text-xs font-medium text-gray-500 mb-1">
                  NRIC <span className="text-gray-400">(Verification will reset once changed)</span>
                </label>
                <input id="prof-nric" value={profileForm.nric} maxLength={9} autoComplete="off"
                  onChange={e => setProfileForm(p => ({ ...p, nric: e.target.value.toUpperCase().slice(0, 9) }))}
                  className={cls(compactInputCls, "font-mono uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:font-sans")} />
              </div>
            </div>

            {profileErr && <p className="mt-3 text-xs font-medium text-red-600">{profileErr}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void saveProfile()} disabled={savingProfile}
                className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                {savingProfile ? "Saving…" : "Save Changes"}
              </button>
              <button type="button" onClick={() => setEditingProfile(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <BMICard bmi={bmi} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Height &amp; weight</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="acct-h" className="block text-xs font-medium text-gray-500 mb-1">Height (cm)</label>
            <input id="acct-h" type="number" value={height} onChange={e => setHeight(e.target.value)}
              min={100} max={200}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="acct-w" className="block text-xs font-medium text-gray-500 mb-1">Weight (kg)</label>
            <input id="acct-w" type="number" value={weight} onChange={e => setWeight(e.target.value)}
              min={20} max={200}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
          </div>
        </div>
        <button type="button" onClick={() => void saveMeas()} disabled={savingMeas}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
          <Save size={14} /> {savingMeas ? "Saving…" : "Save measurement"}
        </button>
        {measurements.length > 0 && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            {measurements.length} measurement{measurements.length !== 1 ? "s" : ""} saved
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3">BMI history</h3>
        <BMIChart data={measurements} />
        {measurements.length >= 2 && (
          <div className="flex gap-3 mt-2 flex-wrap">
            {BMI_ZONES.map(z => (
              <div key={z.label} className="flex items-center gap-1.5">
                <div className={cls("w-2.5 h-2.5 rounded-full", z.bg)} />
                <span className="text-xs text-gray-500">{z.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <EmergencyContactSection contact={user.emergencyContact}
          onSave={handleSaveContact}
          note="Provide a contact person who can be reached in case of an emergency." />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Change password</h3>
        <p className="text-xs text-gray-400 mb-3">
          After the change, all other signed-in devices are logged out.
        </p>
        <div className="space-y-3 mb-3">
          <PwField id="pw-current" label="Current password" value={pwForm.current} error={pwErrors.current}
            onChange={v => setPwForm(p => ({ ...p, current: v }))} />
          <PwField id="pw-new" label="New password" value={pwForm.next} error={pwErrors.next}
            onChange={v => setPwForm(p => ({ ...p, next: v }))} />
          <PwField id="pw-confirm" label="Confirm new password" value={pwForm.confirm} error={pwErrors.confirm}
            onChange={v => setPwForm(p => ({ ...p, confirm: v }))} />
        </div>
        {pwForm.next && <PasswordFeedback value={pwForm.next} userInputs={pwContext} />}
        <button type="button" onClick={() => void changePassword()} disabled={changingPw}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
          {changingPw ? "Changing…" : "Change password"}
        </button>
      </div>
    </div>
  );
}

interface PwFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}

function PwField({ id, label, value, error, onChange }: PwFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <PasswordInput id={id} value={value} onChange={onChange} error={error} className={compactInputCls} />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium capitalize">{value}</span>
    </div>
  );
}
