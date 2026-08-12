import { useMemo, useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { cls, isoDateIn, nowHhMm, todayIso } from "../../../utils/helpers";
import { CLINIC_HOURS, TESTS } from "../../../utils/constants";
import { STATUS_LABEL, STATUS_STYLE } from "../ClinicianShared";
import type { ScheduleEntry, TestId } from "../../../types";

interface ScheduleCardProps {
  entries: ScheduleEntry[];
  onBook: (testId: TestId, date: string, time: string) => Promise<void>;
  onCancel: (entryId: string) => Promise<void>;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Open the form on a slot that can actually be booked: opening time, or the
 * next half hour once the day is under way, or tomorrow morning once the clinic
 * has closed. Without this the card spends most of a working day defaulting to
 * a time the server would reject.
 */
const firstBookableSlot = (): { date: string; time: string } => {
  const now = nowHhMm();
  if (now < CLINIC_HOURS.opens) return { date: todayIso(), time: CLINIC_HOURS.opens };

  const [h, m] = now.split(":").map(Number);
  const next = m < 30 ? `${pad(h)}:30` : `${pad(h + 1)}:00`;
  return next > CLINIC_HOURS.closes
    ? { date: isoDateIn(1), time: CLINIC_HOURS.opens }
    : { date: todayIso(), time: next };
};

const labelForDate = (date: string): string =>
  // Parsed as local midnight, not UTC: "2026-07-27" through Date() alone would
  // be UTC and render as the 26th anywhere east of Greenwich.
  new Date(`${date}T00:00:00`).toLocaleDateString("en-SG", {
    weekday: "short", day: "numeric", month: "short",
  });

export default function ScheduleCard({ entries, onBook, onCancel }: ScheduleCardProps) {
  // One evaluation, so the date and time cannot be read either side of a
  // half-hour boundary and end up disagreeing.
  const opening = useMemo(firstBookableSlot, []);

  const [testId, setTestId] = useState<TestId>(TESTS[0].id);
  const [date, setDate]     = useState(opening.date);
  const [time, setTime]     = useState(opening.time);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");

  const now = nowHhMm();
  const isToday = date === todayIso();
  // On the current day the earliest slot is whichever is later: opening time,
  // or now. `min` is inclusive, and the server accepts the current minute too.
  const minTime = isToday && now > CLINIC_HOURS.opens ? now : CLINIC_HOURS.opens;

  // Every rule the server enforces, checked here first so the clinician sees it
  // before spending a round trip. `entries` covers exactly the bookable range
  // (today onwards), so it is a complete basis for the two clash checks.
  const blockedReason =
    time < CLINIC_HOURS.opens || time > CLINIC_HOURS.closes
      ? `Assessments run between ${CLINIC_HOURS.opens} and ${CLINIC_HOURS.closes}.`
    : isToday && time < now
      ? "That time has already passed today. Pick a later time, or another day."
    : entries.some(e => e.date === date && e.time === time)
      ? "This client is already booked at that time. A client can do several assessments in a day, but not at once."
    : entries.some(e => e.date === date && e.testId === testId)
      ? "This assessment is already booked for that day."
    : "";

  const book = async (): Promise<void> => {
    setBusy(true);
    setErr("");
    try {
      await onBook(testId, date, time);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the booking.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (entryId: string): Promise<void> => {
    setErr("");
    try {
      await onCancel(entryId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not cancel the booking.");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="text-sm font-semibold text-gray-900 mb-1">Upcoming Assessments</h4>
      <p className="text-xs text-gray-400 mb-4">
        Booked sessions appear on the front desk's schedule for that day, where staff run the
        NRIC check and record attendance.
      </p>

      {entries.length === 0
        ? <p className="text-sm text-gray-400 mb-4">Nothing is booked for this patient.</p>
        : (
          <div className="mb-4 divide-y divide-gray-100">
            {entries.map(e => (
              <div key={e._id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-gray-900">
                    {TESTS.find(t => t.id === e.testId)?.name ?? e.testId}
                  </div>
                  <div className="text-xs text-gray-400">
                    {labelForDate(e.date)} · {e.time}
                    {!e.nricVerified && <span className="ml-2 text-amber-600">NRIC not yet verified</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={cls("px-2 py-0.5 rounded-full text-xs font-semibold border", STATUS_STYLE[e.status])}>
                    {STATUS_LABEL[e.status]}
                  </span>
                  {/* Once attendance is marked the visit is a matter of record. */}
                  {e.status === "scheduled" && (
                    <button type="button" onClick={() => void cancel(e._id)} aria-label={`Cancel ${e.testId} on ${e.date}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-gray-100">
        <div className="flex-1 min-w-[10rem]">
          <label htmlFor="book-test" className="block text-xs font-medium text-gray-500 mb-1">Assessment</label>
          <select id="book-test" value={testId} onChange={e => setTestId(e.target.value as TestId)}
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none">
            {TESTS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="book-date" className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input id="book-date" type="date" value={date} min={todayIso()} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="book-time" className="block text-xs font-medium text-gray-500 mb-1">
            Time <span className="text-gray-400">({CLINIC_HOURS.opens}–{CLINIC_HOURS.closes})</span>
          </label>
          <input id="book-time" type="time" value={time}
            min={minTime} max={CLINIC_HOURS.closes}
            onChange={e => setTime(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none" />
        </div>
        <button type="button" onClick={() => void book()} disabled={busy || !date || !time || blockedReason !== ""}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
          <CalendarPlus size={13} /> {busy ? "Booking…" : "Book"}
        </button>
      </div>

      {blockedReason && <p className="mt-2 text-xs text-amber-600">{blockedReason}</p>}
      {err && <p className="mt-2 text-xs font-medium text-red-600">{err}</p>}
    </div>
  );
}
