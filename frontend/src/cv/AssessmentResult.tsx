import {
  ShieldCheck, AlertTriangle, Info, ArrowRight, Timer, Ruler,
} from "lucide-react";
import { cls } from "../utils/helpers";
import { TESTS } from "../utils/constants";
import type { AssessmentSession } from "../types";

/**
 * Post-test result view, driven entirely by the SAVED session - the same
 * record a clinician sees, so what the participant reads here cannot drift from
 * what is stored. Every clinician-facing field is derived server-side; this
 * component only presents it.
 *
 * Presentation discipline (see backend/src/utils/norms.js for why):
 *  - "Within / Above the typical range" reads calm, never as a warning: a
 *    quarter of healthy adults fall below the band by construction.
 *  - Only a validated cut-off (AWGS19) shows red, and always with the
 *    "screening indicator, not a diagnosis" caveat.
 *  - An out-of-range age shows the raw score in neutral styling and does NOT
 *    dress it up as a classification the reference data cannot support.
 */

type Tone = "positive" | "caution" | "alert" | "neutral";

const TONE: Record<Tone, { badge: string; bar: string; ring: string }> = {
  positive: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", ring: "border-emerald-200" },
  caution:  { badge: "bg-amber-50 text-amber-700 border-amber-200",       bar: "bg-amber-500",   ring: "border-amber-200" },
  alert:    { badge: "bg-red-50 text-red-700 border-red-200",             bar: "bg-red-500",     ring: "border-red-200" },
  neutral:  { badge: "bg-slate-100 text-slate-600 border-slate-200",      bar: "bg-slate-400",   ring: "border-slate-200" },
};

interface AssessmentResultProps {
  session: AssessmentSession;
  onDone: () => void;
}

export default function AssessmentResult({ session, onDone }: AssessmentResultProps) {
  const test = TESTS.find(t => t.id === session.testId);
  const testName = test?.name ?? session.testId;
  const score = scoreDisplay(session);
  const tone = classificationTone(session);
  const headline = headlineFor(session);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pt-10 pb-6">
        <p className="text-violet-200 text-sm">Assessment complete</p>
        <h1 className="text-2xl font-bold text-white">{testName}</h1>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto px-4 -mt-3 pb-28 space-y-4">
        {/* Score + classification */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-sm">
          <div className="text-6xl font-black text-gray-900 leading-none">{score.big}</div>
          <div className="text-gray-500 text-sm mt-2">{score.sub}</div>

          <div className={cls("inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full border text-sm font-semibold", TONE[tone].badge)}>
            {headline}
          </div>
          {session.normApplicability === "extrapolated" && (
            <div className="mt-2">
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
                Approximate — age just below the reference range
              </span>
            </div>
          )}

          {hasBand(session) && (
            <NormBar session={session} tone={tone} />
          )}
        </section>

        {/* Plain-language interpretation, verbatim from the server */}
        {session.interpretation && (
          <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex gap-3">
              <Info size={18} className="text-violet-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 leading-relaxed">{session.interpretation}</p>
            </div>
          </section>
        )}

        {/* Sit & reach: FFMOT at-home traffic light */}
        {session.testId === "sit_reach" && session.trafficLight && (
          <TrafficLightCard light={session.trafficLight} />
        )}

        {/* Chair stand: exploratory SPPB sit-to-stand derivation */}
        {session.testId === "chair_stand" && hasSppb(session) && (
          <SppbCard session={session} />
        )}

        {/* Measurement quality + protocol flags */}
        <QualityCard session={session} />
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2 justify-center">
            <ShieldCheck size={13} className="text-emerald-500" />
            Verified result, saved to the record · {formatWhen(session.createdAt)}
          </div>
          <button type="button" onClick={onDone}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white text-lg font-bold py-3.5 rounded-xl min-h-[52px] flex items-center justify-center gap-2">
            Done <ArrowRight size={20} />
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Norm range bar ───────────────────────────────────────────────────────────

function NormBar({ session, tone }: { session: AssessmentSession; tone: Tone }) {
  const low = session.normLow as number;
  const high = session.normHigh as number;
  const value = rawScore(session);
  if (value === null) return null;

  // Domain padded beyond the band so an out-of-band score still has somewhere
  // to sit; clamp the marker so it can never leave the track.
  const pad = Math.max(1, (high - low) * 0.5);
  const lo = Math.min(low, value) - pad;
  const hi = Math.max(high, value) + pad;
  const span = hi - lo || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const unit = session.testId === "chair_stand" ? "" : " cm";

  return (
    <div className="mt-5 text-left">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Typical range for age {session.ageAtTest ?? "?"}</span>
        <span>{fmt(low)}{unit} – {fmt(high)}{unit}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-slate-100">
        <div className="absolute h-full rounded-full bg-emerald-200"
          style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
        <div className={cls("absolute w-3 h-3 rounded-full -top-[3px] -ml-1.5 border-2 border-white shadow", TONE[tone].bar)}
          style={{ left: `${pct(value)}%` }} />
      </div>
    </div>
  );
}

// ── Traffic light (sit & reach) ──────────────────────────────────────────────

const LIGHT: Record<"red" | "amber" | "green", { dot: string; label: string }> = {
  green: { dot: "bg-emerald-500", label: "You reached your toes or beyond." },
  amber: { dot: "bg-amber-500",   label: "You reached between your knee and your toes." },
  red:   { dot: "bg-red-500",     label: "You did not reach past your knee." },
};

function TrafficLightCard({ light }: { light: "red" | "amber" | "green" }) {
  const l = LIGHT[light];
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Functional Fitness MOT rating</div>
      <div className="flex items-center gap-3">
        <span className={cls("w-5 h-5 rounded-full flex-shrink-0", l.dot)} />
        <span className="text-sm text-gray-700 capitalize font-medium">{light}</span>
      </div>
      <p className="text-sm text-gray-500 mt-2">{l.label}</p>
    </section>
  );
}

// ── SPPB sit-to-stand (chair stand) ──────────────────────────────────────────

function SppbCard({ session }: { session: AssessmentSession }) {
  const seconds = session.timeTo5StandsS;
  const points = session.sppbStsPoints;
  const slow = session.awgs19SlowSts === true;
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        <Timer size={14} /> Sit-to-stand timing
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Time for 5 stands" value={typeof seconds === "number" ? `${seconds.toFixed(1)} s` : "Not reached"} />
        <Stat label="SPPB points" value={typeof points === "number" ? `${points} / 4` : "—"} />
      </div>
      {slow && (
        <div className="mt-3 flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Meets a screening threshold (AWGS19, 12 s or more). This is a screening
            indicator, not a diagnosis — a clinician should review.
          </p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">
        Exploratory: derived from the 30-second test, not a standalone SPPB score.
      </p>
    </section>
  );
}

// ── Quality + protocol flags ─────────────────────────────────────────────────

function QualityCard({ session }: { session: AssessmentSession }) {
  const quality = typeof session.calibrationQuality === "number"
    ? Math.round(session.calibrationQuality * 100) : null;
  const review = session.needsQualityReview === true;
  const kneeBent = session.testId === "sit_reach" && session.kneeBent === true;

  const notes: { tone: "amber" | "muted"; text: string }[] = [];
  if (review) {
    notes.push({ tone: "amber", text: "Tracking was unstable during setup, so this reading is less reliable. A clinician should confirm it." });
  }
  if (kneeBent) {
    notes.push({ tone: "amber", text: "Your knee bent during the hold, which can overstate the reach. A clinician will review whether the trial stands." });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        <Ruler size={14} /> Measurement quality
      </div>
      <div className="grid grid-cols-2 gap-3">
        {quality !== null && (
          <Stat label="Tracking quality" value={`${quality}%`} tone={review ? "amber" : undefined} />
        )}
        {session.ageAtTest !== undefined && (
          <Stat label="Compared using" value={`Age ${session.ageAtTest}${session.sexAtTest ? ` · ${session.sexAtTest}` : ""}`} />
        )}
      </div>
      {notes.map((n, i) => (
        <div key={i} className={cls(
          "mt-3 flex gap-2 items-start rounded-lg p-3",
          n.tone === "amber" ? "bg-amber-50 border border-amber-200" : "bg-slate-50 border border-slate-200",
        )}>
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">{n.text}</p>
        </div>
      ))}
      {notes.length === 0 && quality !== null && (
        <p className="text-[11px] text-gray-400 mt-3">Tracking was stable — this reading can be read at face value.</p>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className={cls("text-lg font-bold", tone === "amber" ? "text-amber-600" : "text-gray-900")}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

// ── Derivations ──────────────────────────────────────────────────────────────

function rawScore(s: AssessmentSession): number | null {
  if (s.testId === "chair_stand") return typeof s.reps === "number" ? s.reps : null;
  return typeof s.measurement === "number" ? s.measurement : null;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function signedCm(cm: number): string {
  return `${cm >= 0 ? "+" : ""}${cm.toFixed(1)} cm`;
}

function scoreDisplay(s: AssessmentSession): { big: string; sub: string } {
  if (s.testId === "chair_stand") {
    const reps = s.reps ?? 0;
    return { big: String(reps), sub: `chair stand${reps === 1 ? "" : "s"} in 30 seconds` };
  }
  const cm = s.measurement ?? 0;
  if (s.testId === "sit_reach") {
    return { big: signedCm(cm), sub: cm > 0 ? "past your toes" : cm < 0 ? "short of your toes" : "level with your toes" };
  }
  // back_scratch
  return { big: signedCm(cm), sub: cm > 0 ? "fingers overlapping" : cm < 0 ? "gap between fingertips" : "fingertips touching" };
}

function classificationTone(s: AssessmentSession): Tone {
  if (s.normApplicability === "out_of_range" || !s.classification) return "neutral";
  if (s.riskLevel === "high") return "alert";
  if (s.riskLevel === "moderate") return "caution";
  if (s.riskLevel === "low") return "positive";
  return "neutral";
}

function headlineFor(s: AssessmentSession): string {
  if (!s.classification) return "No reference comparison available";
  switch (s.classification) {
    case "Above Average": return "Above the typical range for your age";
    case "Average":       return "Within the typical range for your age";
    case "Below Average": return "Below the typical range for your age";
    default:              return s.classification; // "Not classifiable against Rikli & Jones norms"
  }
}

function hasBand(s: AssessmentSession): boolean {
  return typeof s.normLow === "number" && typeof s.normHigh === "number";
}

function hasSppb(s: AssessmentSession): boolean {
  return typeof s.timeTo5StandsS === "number" || typeof s.sppbStsPoints === "number";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
