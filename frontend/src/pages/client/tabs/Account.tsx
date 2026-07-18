import { useEffect, useState } from "react";
import { Save, Pencil } from "lucide-react";
import { cls, calculateAge, formatDOB, isValidNric } from "../../../utils/helpers";
import { measurementApi, userApi } from "../../../utils/api";
import { EmergencyContactSection } from "../../../components/EmergencyContact";
import { BMICard, BMIChart, BMI_ZONES, calcBmi } from "../components/BMICard";
import type { EmergencyContact, Measurement, User } from "../../../types";

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
  const [editingNric, setEditingNric]     = useState(false);
  const [newNric, setNewNric]             = useState("");
  const [savingNric, setSavingNric]       = useState(false);

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

  const saveNric = async (): Promise<void> => {
    if (!isValidNric(newNric)) {
      showToast("Please enter a valid Singapore NRIC or FIN.", false);
      return;
    }
    if (!window.confirm(
      "Changing your NRIC will reset your verification.\n\n" +
      "Your features will be locked until staff re-check your NRIC at the clinic and an administrator approves it. Continue?",
    )) return;
    setSavingNric(true);
    try {
      const updated = await userApi.updateNric(user._id, newNric.trim().toUpperCase());
      onUserUpdate(updated);
      setEditingNric(false);
      setNewNric("");
      showToast("NRIC updated. Please visit the clinic to verify again");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update NRIC", false);
    } finally {
      setSavingNric(false);
    }
  };

  // Sync the parent user with the server response so the card always shows
  // the persisted contact — an invalid or failed change can never appear
  // saved. Validation, confirmation and error display live in the shared
  // EmergencyContactSection.
  const handleSaveContact = async (contactValue: EmergencyContact): Promise<void> => {
    const updated = await userApi.saveEmergencyContact(user._id, contactValue);
    onUserUpdate(updated);
    showToast("Emergency contact saved");
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
        <h3 className="text-base font-semibold text-gray-900 mb-3">Profile</h3>
        <Row label="Name"          value={user.name} />
        <Row label="Email"         value={user.email} />
        <Row label="Date of birth" value={user.dateOfBirth ? `${formatDOB(user.dateOfBirth)} · age ${age ?? "—"}` : "—"} />
        <Row label="Gender"        value={user.gender ?? "—"} />
        <Row label="Verification"  value={user.verificationStatus} />

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-500">NRIC</span>
          {!editingNric ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-gray-900 font-medium font-mono tracking-widest">
                {user.nricLastFour ? `•••••${user.nricLastFour}` : "—"}
              </span>
              <button type="button" onClick={() => { setEditingNric(true); setNewNric(""); }}
                title="Update NRIC"
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-violet-600 transition-colors">
                <Pencil size={14} />
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <input value={newNric}
                onChange={e => setNewNric(e.target.value.toUpperCase().slice(0, 9))}
 maxLength={9} autoComplete="off"
                className="w-40 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono uppercase focus:border-violet-500 focus:outline-none" />
              <button type="button" onClick={() => void saveNric()} disabled={savingNric || !isValidNric(newNric)}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                {savingNric ? "…" : "Save"}
              </button>
              <button type="button" onClick={() => { setEditingNric(false); setNewNric(""); }}
                className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold transition-colors">
                Cancel
              </button>
            </span>
          )}
        </div>
        {editingNric && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Changing your NRIC resets your verification. Your features will be locked until it is
            re-checked at the clinic and approved by an administrator.
          </p>
        )}
      </div>

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
