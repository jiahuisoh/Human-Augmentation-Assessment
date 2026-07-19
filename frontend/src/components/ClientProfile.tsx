import { useState } from "react";
import { Pencil } from "lucide-react";
import { cls, calculateAge, formatDOB, normalizeSgPhone } from "../utils/helpers";
import { EmergencyContactSection, RELATIONSHIPS } from "./EmergencyContact";
import type { EmergencyContact, ProfileUpdate, Sex, User } from "../types";

// Calendar bounds for the date-of-birth picker: nothing after today, nothing
// implausibly old. The backend birthDate rule enforces the same window.
const today   = new Date();
const MAX_DOB = today.toISOString().split("T")[0];
const MIN_DOB = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate()).toISOString().split("T")[0];

const STATUS_STYLES: Record<User["verificationStatus"], string> = {
  verified:   "bg-green-50 text-green-700 border-green-200",
  pending:    "bg-amber-50 text-amber-700 border-amber-200",
  unverified: "bg-gray-50 text-gray-500 border-gray-200",
  suspended:  "bg-red-50 text-red-600 border-red-200",
};

const ACCENTS = {
  violet: { focus: "focus:border-violet-500", within: "focus-within:border-violet-500", btn: "bg-violet-600 hover:bg-violet-700", pencil: "hover:text-violet-600" },
  teal:   { focus: "focus:border-teal-500",   within: "focus-within:border-teal-500",   btn: "bg-teal-600 hover:bg-teal-700",     pencil: "hover:text-teal-600" },
} as const;

const labelCls = "block text-xs font-medium text-gray-500 mb-1";
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none";

interface Draft {
  name: string;
  dateOfBirth: string;
  gender: Sex;
  height: string;
  weight: string;
  contact: { name: string; phone: string; relationship: string };
}

interface ClientProfile {
  user: User;
  onSaveProfile?: (fields: ProfileUpdate) => Promise<void>;
  onSaveEmergencyContact?: (contact: EmergencyContact) => Promise<void>;
  accent?: "violet" | "teal";
}

export function ClientProfile({ user, onSaveProfile, onSaveEmergencyContact, accent = "violet" }: ClientProfile) {
  const a = ACCENTS[accent];
  const canEdit = !!(onSaveProfile || onSaveEmergencyContact);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [draft, setDraft]     = useState<Draft>({
    name: "", dateOfBirth: "", gender: "male", height: "", weight: "",
    contact: { name: "", phone: "", relationship: "" },
  });

  const age = calculateAge(user.dateOfBirth);

  const startEdit = (): void => {
    setDraft({
      name: user.name,
      dateOfBirth: user.dateOfBirth ?? "",
      gender: user.gender ?? "male",
      height: user.height != null ? String(user.height) : "",
      weight: user.weight != null ? String(user.weight) : "",
      contact: {
        name: user.emergencyContact?.name ?? "",
        phone: (user.emergencyContact?.phone ?? "").replace(/^\+65/, ""),
        relationship: user.emergencyContact?.relationship ?? "",
      },
    });
    setErr("");
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    // ── Validate ──────────────────────────────────────────────────────────
    const name = draft.name.trim();
    if (onSaveProfile && !name) { setErr("Please enter a name."); return; }
    if (draft.dateOfBirth) {
      const dobAge = calculateAge(draft.dateOfBirth);
      if (dobAge === null || dobAge < 18 || dobAge > 120) {
        setErr("Please enter a valid date of birth (client must be 18 or older).");
        return;
      }
    }
    const height = draft.height.trim() === "" ? undefined : Number(draft.height);
    const weight = draft.weight.trim() === "" ? undefined : Number(draft.weight);
    if (height !== undefined && (!Number.isFinite(height) || height < 100 || height > 200)) {
      setErr("Height must be between 100 and 200 cm.");
      return;
    }
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 20 || weight > 200)) {
      setErr("Weight must be between 20 and 200 kg.");
      return;
    }

    const c = draft.contact;
    let contactNext: EmergencyContact | null = null;
    if (onSaveEmergencyContact && (c.name.trim() || c.phone.trim() || c.relationship)) {
      const phone = normalizeSgPhone(c.phone);
      if (!c.name.trim() || !c.relationship) {
        setErr("Please fill in the emergency contact's name, phone and relationship.");
        return;
      }
      if (!phone) {
        setErr("Please enter a valid Singapore phone number for the emergency contact.");
        return;
      }
      contactNext = { name: c.name.trim(), phone, relationship: c.relationship };
    }

    // ── Diff: only what actually changed is sent (and audited) ────────────
    const basics: ProfileUpdate = {};
    if (onSaveProfile) {
      if (name !== user.name)                                  basics.name = name;
      if (draft.dateOfBirth && draft.dateOfBirth !== user.dateOfBirth) basics.dateOfBirth = draft.dateOfBirth;
      if (draft.gender !== user.gender)                        basics.gender = draft.gender;
      if (height !== undefined && height !== user.height)      basics.height = height;
      if (weight !== undefined && weight !== user.weight)      basics.weight = weight;
    }
    const orig = user.emergencyContact;
    const contactChanged = contactNext !== null && (
      !orig || orig.name !== contactNext.name || orig.phone !== contactNext.phone
      || orig.relationship !== contactNext.relationship
    );
    if (Object.keys(basics).length === 0 && !contactChanged) {
      setEditing(false); // nothing changed
      return;
    }
    if (!window.confirm(`Save profile changes for ${name || user.name}?`)) return;

    setSaving(true);
    setErr("");
    try {
      if (Object.keys(basics).length > 0) await onSaveProfile?.(basics);
      if (contactChanged && contactNext)  await onSaveEmergencyContact?.(contactNext);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save the profile.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-3">
        {onSaveProfile && (
          <>
            <div>
              <label htmlFor="cp-name" className={labelCls}>Full Name</label>
              <input id="cp-name" value={draft.name} maxLength={120}
                onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                className={cls(inputCls, a.focus)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cp-dob" className={labelCls}>Date of Birth</label>
                <input id="cp-dob" type="date" value={draft.dateOfBirth}
                  min={MIN_DOB} max={MAX_DOB}
                  onChange={e => setDraft(p => ({ ...p, dateOfBirth: e.target.value }))}
                  className={cls(inputCls, a.focus)} />
              </div>
              <div>
                <label htmlFor="cp-gender" className={labelCls}>Gender</label>
                <select id="cp-gender" value={draft.gender}
                  onChange={e => setDraft(p => ({ ...p, gender: e.target.value as Sex }))}
                  className={cls(inputCls, a.focus, "bg-white capitalize")}>
                  {(["male", "female", "other"] as const).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="cp-height" className={labelCls}>Height (cm)</label>
                <input id="cp-height" type="number" min={100} max={200} value={draft.height}
                  onChange={e => setDraft(p => ({ ...p, height: e.target.value }))}
                  className={cls(inputCls, a.focus)} />
              </div>
              <div>
                <label htmlFor="cp-weight" className={labelCls}>Weight (kg)</label>
                <input id="cp-weight" type="number" min={20} max={200} value={draft.weight}
                  onChange={e => setDraft(p => ({ ...p, weight: e.target.value }))}
                  className={cls(inputCls, a.focus)} />
              </div>
            </div>
          </>
        )}

        {onSaveEmergencyContact && (
          <div className="pt-3 border-t border-gray-100 space-y-3">
            <h4 className="text-sm font-semibold text-gray-900">Emergency Contact</h4>
            <div>
              <label htmlFor="cp-ec-name" className={labelCls}>Name</label>
              <input id="cp-ec-name" value={draft.contact.name}
                onChange={e => setDraft(p => ({ ...p, contact: { ...p.contact, name: e.target.value } }))}
                className={cls(inputCls, a.focus)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cp-ec-phone" className={labelCls}>Phone</label>
                <div className={cls("flex items-center border border-gray-200 rounded-lg bg-white", a.within)}>
                  <span className="pl-3 pr-1.5 text-sm text-gray-500 select-none">+65</span>
                  <input id="cp-ec-phone" type="tel" inputMode="numeric" maxLength={9}
                    value={draft.contact.phone.replace(/^\+65/, "")}
                    onChange={e => setDraft(p => ({ ...p, contact: { ...p.contact, phone: e.target.value } }))}
                    className="w-full py-2 pr-3 text-sm bg-transparent focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="cp-ec-rel" className={labelCls}>Relationship</label>
                <select id="cp-ec-rel" value={draft.contact.relationship}
                  onChange={e => setDraft(p => ({ ...p, contact: { ...p.contact, relationship: e.target.value } }))}
                  className={cls(inputCls, a.focus, "bg-white")}>
                  <option value="">Select…</option>
                  {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {err && <p className="text-xs font-medium text-red-600">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => void save()} disabled={saving}
            className={cls("flex-1 py-2 rounded-lg disabled:opacity-60 text-white text-sm font-semibold transition-colors", a.btn)}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" onClick={() => { setEditing(false); setErr(""); }}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center justify-between -mb-2">
          <span className="text-xs font-medium text-gray-500">Personal Details</span>
          <button type="button" onClick={startEdit}
            aria-label="Edit profile" title="Edit profile"
            className={cls("p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors", a.pencil)}>
            <Pencil size={14} />
          </button>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {([
          ["Full Name",     user.name],
          ["Email",         user.email, "break-all"],
          ["Date Of Birth", user.dateOfBirth ? formatDOB(user.dateOfBirth) : "-"],
          ["Age",           age !== null ? `${age} years` : "-"],
          ["Gender",        user.gender ?? "-", "capitalize"],
          ["NRIC",          user.nricLastFour ? `•••••${user.nricLastFour}` : "-", "font-mono tracking-wider"],
          ["Height",        user.height != null ? `${user.height} cm` : "-"],
          ["Weight",        user.weight != null ? `${user.weight} kg` : "-"],
        ] as ReadonlyArray<readonly [string, string, string?]>).map(([label, value, extra]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-gray-500 mb-0.5">{label}</dt>
            <dd className={cls("text-sm font-semibold text-gray-900", extra)}>{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs font-medium text-gray-500 mb-1">Verification Status</dt>
          <dd>
            <span className={cls(
              "inline-block px-2 py-0.5 rounded-full text-xs font-semibold border capitalize",
              STATUS_STYLES[user.verificationStatus],
            )}>
              {user.verificationStatus}
            </span>
          </dd>
        </div>
      </dl>

      <div className="pt-4 border-t border-gray-100">
        <EmergencyContactSection contact={user.emergencyContact} accent={accent} />
      </div>
    </div>
  );
}
