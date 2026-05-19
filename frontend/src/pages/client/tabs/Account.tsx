import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { cls, calculateAge, formatDOB } from "../../../utils/helpers";
import { measurementApi, userApi } from "../../../utils/api";
import { BMICard, BMIChart, BMI_ZONES, calcBmi } from "../components/BMICard";
import type { EmergencyContact, Measurement, User } from "../../../types";

interface AccountProps {
  user: User;
}

export default function Account({ user }: AccountProps) {
  const [height, setHeight]               = useState<string>(user.height?.toString() ?? "");
  const [weight, setWeight]               = useState<string>(user.weight?.toString() ?? "");
  const [measurements, setMeasurements]   = useState<Measurement[]>([]);
  const [contact, setContact]             = useState<EmergencyContact>(user.emergencyContact ?? { name: "", phone: "", relationship: "" });
  const [savingMeas, setSavingMeas]       = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { void measurementApi.listForClient(user._id).then(setMeasurements); }, [user._id]);

  const showToast = (msg: string, ok = true): void => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3000);
  };

  const bmi = calcBmi(Number(height), Number(weight));
  const age = calculateAge(user.dateOfBirth);

  const saveMeas = async (): Promise<void> => {
    const h = Number(height), w = Number(weight);
    if (h < 100 || h > 250 || w < 20 || w > 300) {
      showToast("Enter a valid height (100–250 cm) and weight (20–300 kg).", false);
      return;
    }
    setSavingMeas(true);
    try {
      const m = await measurementApi.save(user._id, h, w);
      setMeasurements(prev => [...prev, m]);
      showToast(`Saved — BMI ${m.bmi}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", false);
    } finally {
      setSavingMeas(false);
    }
  };

  const saveContact = async (): Promise<void> => {
    if (!contact.name.trim() || !contact.phone.trim() || !contact.relationship.trim()) {
      showToast("Please fill in name, phone, and relationship.", false);
      return;
    }
    setSavingContact(true);
    try {
      await userApi.saveEmergencyContact(user._id, contact);
      showToast("Emergency contact saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", false);
    } finally {
      setSavingContact(false);
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
        <h3 className="text-base font-semibold text-gray-900 mb-3">Profile</h3>
        <Row label="Name"          value={user.name} />
        <Row label="Email"         value={user.email} />
        <Row label="Date of birth" value={user.dateOfBirth ? `${formatDOB(user.dateOfBirth)} · age ${age ?? "—"}` : "—"} />
        <Row label="Gender"        value={user.gender ?? "—"} />
        <Row label="Verification"  value={user.verificationStatus} />
      </div>

      <BMICard bmi={bmi} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Height &amp; weight</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="acct-h" className="block text-xs font-medium text-gray-500 mb-1">Height (cm)</label>
            <input id="acct-h" type="number" value={height} onChange={e => setHeight(e.target.value)}
              min={100} max={250} placeholder="162"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="acct-w" className="block text-xs font-medium text-gray-500 mb-1">Weight (kg)</label>
            <input id="acct-w" type="number" value={weight} onChange={e => setWeight(e.target.value)}
              min={20} max={300} placeholder="65"
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
        <h3 className="text-base font-semibold text-gray-900 mb-1">Emergency contact</h3>
        <p className="text-xs text-gray-400 mb-3">Notified if you report discomfort during a session.</p>
        <div className="space-y-2 mb-3">
          <div>
            <label htmlFor="ec-name" className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input id="ec-name" value={contact.name} onChange={e => setContact(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Tan Mei Ling"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="ec-phone" className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input id="ec-phone" type="tel" value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))}
              placeholder="+65 9123 4567"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="ec-rel" className="block text-xs font-medium text-gray-500 mb-1">Relationship</label>
            <select id="ec-rel" value={contact.relationship} onChange={e => setContact(p => ({ ...p, relationship: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none">
              <option value="">Select…</option>
              {["Spouse / Partner", "Son", "Daughter", "Sibling", "Friend", "Carer", "Other"].map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" onClick={() => void saveContact()} disabled={savingContact}
          className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
          <Save size={14} /> {savingContact ? "Saving…" : "Save emergency contact"}
        </button>
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
