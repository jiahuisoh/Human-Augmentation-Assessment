import { useState } from "react";
import { Pencil } from "lucide-react";
import { cls, normalizeSgPhone } from "../utils/helpers";
import type { EmergencyContact } from "../types";

export const RELATIONSHIPS = ["Spouse / Partner", "Son", "Daughter", "Sibling", "Friend", "Carer", "Other"];

// Per-page accent so the section blends into the violet (client) and teal
// (staff) themes. Classes are written out in full for the Tailwind scanner.
const ACCENTS = {
  violet: { focus: "focus:border-violet-500", within: "focus-within:border-violet-500", btn: "bg-violet-600 hover:bg-violet-700", pencil: "hover:text-violet-600" },
  teal:   { focus: "focus:border-teal-500",   within: "focus-within:border-teal-500",   btn: "bg-teal-600 hover:bg-teal-700",     pencil: "hover:text-teal-600" },
} as const;

const labelCls = "block text-xs font-medium text-gray-500 mb-1";
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none";

interface EmergencyContactSectionProps {
  contact?: EmergencyContact;
  /** When provided, a pencil toggles the edit form. Saving asks for
   *  confirmation before anything is written; errors surface inline. */
  onSave?: (contact: EmergencyContact) => Promise<void>;
  accent?: keyof typeof ACCENTS;
  /** Optional helper text under the heading (e.g. when it is notified). */
  note?: string;
}

const BLANK: EmergencyContact = { name: "", phone: "", relationship: "" };

export function EmergencyContactSection({ contact, onSave, accent = "violet", note }: EmergencyContactSectionProps) {
  const a = ACCENTS[accent];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<EmergencyContact>(BLANK);
  const [err, setErr]         = useState("");
  const [saving, setSaving]   = useState(false);

  const startEdit = (): void => {
    setDraft(contact ?? BLANK);
    setErr("");
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    const phone = normalizeSgPhone(draft.phone);
    if (!draft.name.trim() || !draft.relationship.trim()) {
      setErr("Please fill in name, phone and relationship.");
      return;
    }
    if (!phone) {
      setErr("Please enter a valid Singapore phone number (8 digits starting with 6, 8 or 9).");
      return;
    }
    const next: EmergencyContact = { name: draft.name.trim(), phone, relationship: draft.relationship };
    if (!window.confirm(`Save this emergency contact?\n\n${next.name} (${next.relationship})\n${next.phone}`)) return;
    setSaving(true);
    setErr("");
    try {
      await onSave?.(next);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save the emergency contact.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900">Emergency Contact</h4>
        {onSave && !editing && (
          <button type="button" onClick={startEdit}
            aria-label="Edit emergency contact" title="Edit emergency contact"
            className={cls("p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors", a.pencil)}>
            <Pencil size={14} />
          </button>
        )}
      </div>
      {note && <p className="text-xs text-gray-400 mb-2">{note}</p>}

      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 mt-1">
          {([
            ["Name",         contact?.name],
            ["Phone",        contact?.phone],
            ["Relationship", contact?.relationship],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <div className="text-xs font-medium text-gray-500 mb-0.5">{label}</div>
              {value
                ? <div className="text-sm font-semibold text-gray-900">{value}</div>
                : <div className="text-sm text-gray-400">Not provided</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 mt-1">
          <div>
            <label htmlFor="ecs-name" className={labelCls}>Name</label>
            <input id="ecs-name" value={draft.name}
              onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              className={cls(inputCls, a.focus)} />
          </div>
          <div>
            <label htmlFor="ecs-phone" className={labelCls}>Phone</label>
            <div className={cls("flex items-center border border-gray-200 rounded-lg bg-white", a.within)}>
              <span className="pl-3 pr-1.5 text-sm text-gray-500 select-none">+65</span>
              <input id="ecs-phone" type="tel" inputMode="numeric" maxLength={9}
                value={draft.phone.replace(/^\+65/, "")}
                onChange={e => setDraft(p => ({ ...p, phone: e.target.value }))}
                className="w-full py-2 pr-3 text-sm bg-transparent focus:outline-none" />
            </div>
          </div>
          <div>
            <label htmlFor="ecs-rel" className={labelCls}>Relationship</label>
            <select id="ecs-rel" value={draft.relationship}
              onChange={e => setDraft(p => ({ ...p, relationship: e.target.value }))}
              className={cls(inputCls, a.focus, "bg-white")}>
              <option value="">Select…</option>
              {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          {err && <p className="text-xs font-medium text-red-600">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => void save()} disabled={saving}
              className={cls("flex-1 py-2 rounded-lg disabled:opacity-60 text-white text-sm font-semibold transition-colors", a.btn)}>
              {saving ? "Saving…" : "Save Contact"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setErr(""); }}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
