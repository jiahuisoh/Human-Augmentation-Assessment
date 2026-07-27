import { useState } from "react";
import { cls } from "../../../utils/helpers";
import type { Measurement } from "../../../types";

// ---- Types -------------------------------------------------------

export interface BMICategoryInfo {
  label: "Underweight" | "Normal" | "Overweight" | "Obese";
  risk: string;
  text: string;
  bg: string;
  border: string;
  advice: string;
}

// ---- Public helpers ---------------------------------------------

export function calcBmi(h: number, w: number): number | null {
  if (!h || !w || h < 50 || w < 10) return null;
  return +(w / ((h / 100) ** 2)).toFixed(1);
}

export function bmiCategory(bmi: number | null): BMICategoryInfo | null {
  if (bmi === null) return null;
  if (bmi < 18.5) return { label: "Underweight", risk: "Poor Nutrition Risk", text: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-300",   advice: "You may need to increase your food intake. Speak to your clinician or dietitian." };
  if (bmi < 23.0) return { label: "Normal",      risk: "Low Risk",            text: "text-green-700",  bg: "bg-green-50",  border: "border-green-300",  advice: "Your BMI is within the healthy Asian range. Keep up your habits." };
  if (bmi < 27.5) return { label: "Overweight",  risk: "Moderate Risk",       text: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-400", advice: "Consider gentle exercise and healthy eating. Speak to your clinician for advice." };
  return            { label: "Obese",       risk: "High Risk",            text: "text-red-700",    bg: "bg-red-50",    border: "border-red-300",    advice: "Speak to your clinician. Managing your weight reduces chronic disease risk." };
}

// ---- Internal zone data -----------------------------------------

interface Zone { label: string; width: string; bg: string }
const ZONES: ReadonlyArray<Zone> = [
  { label: "Underweight", width: "14%", bg: "bg-blue-400"   },
  { label: "Normal",      width: "18%", bg: "bg-green-400"  },
  { label: "Overweight",  width: "18%", bg: "bg-yellow-400" },
  { label: "Obese",       width: "50%", bg: "bg-red-400"    },
];

function bmiToPercent(bmi: number): number {
  return Math.min(100, Math.max(0, ((bmi - 15) / 25) * 100));
}

// ---- BMIBar (internal) -------------------------------------------

const TICKS: { value: number; label: string }[] = [
  { value: 15,   label: "15"   },
  { value: 18.5, label: "18.5" },
  { value: 23,   label: "23"   },
  { value: 27.5, label: "27.5" },
  { value: 40,   label: "40+"  },
];

const LEGEND: { label: string; bg: string }[] = [
  { label: "Underweight", bg: "bg-blue-400"   },
  { label: "Normal",      bg: "bg-green-400"  },
  { label: "Overweight",  bg: "bg-yellow-400" },
  { label: "Obese",       bg: "bg-red-400"    },
];

function BMIBar({ bmi }: { bmi: number }) {
  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-full overflow-hidden flex">
        {ZONES.map(z => <div key={z.label} className={cls("h-full", z.bg)} style={{ width: z.width }} />)}
        <div
          className="absolute top-0 bottom-0 w-1.5 bg-gray-900 rounded-full border border-white"
          style={{ left: `calc(${bmiToPercent(bmi)}% - 3px)` }}
        />
      </div>
      <div className="relative mt-1 h-4">
        {TICKS.map(({ value, label }) => (
          <span
            key={label}
            className="absolute text-[10px] text-gray-400 font-mono -translate-x-1/2"
            style={{ left: `${bmiToPercent(value)}%` }}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Singapore / Asian BMI classification (HPB)</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {LEGEND.map(l => (
          <span key={l.label} className="flex items-center gap-1 text-[11px] text-gray-600">
            <span className={cls("inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0", l.bg)} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- BMIChart (exported, reusable) -------------------------------

// The classification bands ARE the point of a BMI trend, so they are drawn
// behind the line and named beside it. Washes, not blocks: the line and the
// axis text have to stay legible on top of them.
interface Band { label: string; from: number; to: number; fill: string }
const BANDS: ReadonlyArray<Band> = [
  { label: "Underweight", from: 0,    to: 18.5, fill: "#eff6ff" },
  { label: "Normal",      from: 18.5, to: 23,   fill: "#f0fdf4" },
  { label: "Overweight",  from: 23,   to: 27.5, fill: "#fffbeb" },
  { label: "Obese",       from: 27.5, to: 100,  fill: "#fef2f2" },
];
const THRESHOLDS = [18.5, 23, 27.5];
const ACCENT = "#7c3aed";

const stampFor = (iso: string, sameDay: boolean): string =>
  new Date(iso).toLocaleString("en-SG", sameDay
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { day: "numeric", month: "short" });

interface BMIChartProps { data: Measurement[] }

export function BMIChart({ data }: BMIChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [showValues, setShowValues] = useState(false);

  if (data.length < 2) {
    return <p className="text-xs text-gray-400 italic">Save at least 2 measurements to see your trend.</p>;
  }

  const W = 320, H = 150, PL = 30, PR = 62, PT = 12, PB = 22;
  const IW = W - PL - PR, IH = H - PT - PB;

  const vals = data.map(d => d.bmi);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  // At least four BMI units of range, so a band is always tall enough to read
  // and a half-point wobble does not fill the card.
  const pad = Math.max(1, (hi - lo) * 0.3);
  const mid = (lo + hi) / 2;
  const span = Math.max(4, hi - lo + pad * 2);
  const minV = Math.max(12, mid - span / 2);
  const maxV = Math.min(42, mid + span / 2);

  const toX = (i: number) => PL + (i / (data.length - 1)) * IW;
  const toY = (v: number) => PT + IH - ((v - minV) / (maxV - minV)) * IH;
  const clampY = (v: number) => Math.min(PT + IH, Math.max(PT, toY(v)));

  // Every reading on one calendar day would otherwise render as the same label
  // repeated; fall back to the clock when that happens.
  const days = new Set(data.map(d => new Date(d.createdAt).toDateString()));
  const sameDay = days.size === 1;

  const ticks = THRESHOLDS.filter(t => t > minV && t < maxV);
  const latest = data.length - 1;
  const points = data.map((d, i) => `${toX(i)},${toY(d.bmi)}`).join(" ");
  const shown = active ?? latest;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`BMI trend across ${data.length} measurements, latest ${data[latest].bmi}`}>
        {BANDS.map(b => {
          const top = clampY(Math.min(b.to, maxV));
          const bottom = clampY(Math.max(b.from, minV));
          const height = bottom - top;
          if (height <= 0.5) return null;
          return (
            <g key={b.label}>
              <rect x={PL} y={top} width={IW} height={height} fill={b.fill} />
              {/* Named outside the plot, so a label can never sit under the data
                  or be clipped by a band too short to hold it. */}
              {height >= 11 && (
                <text x={W - PR + 6} y={top + height / 2 + 3} fontSize="8" fill="#6b7280">{b.label}</text>
              )}
            </g>
          );
        })}

        {/* Thresholds are the numbers worth marking. When someone sits well
            inside one band none fall in view, so the domain bounds stand in -
            otherwise the line would float against an unlabelled wash. */}
        {(ticks.length > 0 ? ticks : [minV, maxV]).map(t => (
          <g key={t}>
            {ticks.length > 0 && (
              <line x1={PL} x2={PL + IW} y1={toY(t)} y2={toY(t)} stroke="#e5e7eb" strokeWidth="1" />
            )}
            <text x={PL - 5} y={Math.min(PT + IH, Math.max(PT + 3, toY(t) + 3))} textAnchor="end"
              fontSize="8" fill="#9ca3af" style={{ fontVariantNumeric: "tabular-nums" }}>
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        <polyline points={points} fill="none" stroke={ACCENT} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <circle key={`${d._id}-dot`} cx={toX(i)} cy={toY(d.bmi)} r={i === shown ? 5 : 3.5}
            fill={ACCENT} stroke="white" strokeWidth="2" />
        ))}

        {/* Hit targets are far bigger than the dots - an 8px mark you must land
            on dead centre is unusable, especially by touch. */}
        {data.map((d, i) => (
          <circle key={`${d._id}-hit`} cx={toX(i)} cy={toY(d.bmi)} r="12" fill="transparent"
            tabIndex={0} role="button" aria-label={`${d.bmi} on ${stampFor(d.createdAt, false)}`}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            style={{ cursor: "pointer", outline: "none" }} />
        ))}

        {/* One direct label, on the reading being pointed at - the latest by
            default. A number on every dot is noise. */}
        <text x={Math.min(toX(shown) + 8, W - PR - 2)} y={Math.max(toY(data[shown].bmi) - 8, PT + 8)}
          textAnchor={toX(shown) > PL + IW - 30 ? "end" : "start"}
          fontSize="11" fontWeight="600" fill="#111827">
          {data[shown].bmi}
        </text>

        <text x={PL} y={H - 6} fontSize="8" fill="#9ca3af">{stampFor(data[0].createdAt, sameDay)}</text>
        <text x={PL + IW} y={H - 6} textAnchor="end" fontSize="8" fill="#9ca3af">
          {stampFor(data[latest].createdAt, sameDay)}
        </text>
      </svg>

      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-gray-400">
          {sameDay ? "All readings taken on the same day." : `${data.length} readings`}
        </p>
        {/* A tooltip must never be the only way to read a value. */}
        <button type="button" onClick={() => setShowValues(v => !v)}
          className="text-[11px] font-medium text-violet-600 hover:text-violet-700">
          {showValues ? "Hide Values" : "Show Values"}
        </button>
      </div>

      {showValues && (
        <table className="w-full mt-2 text-xs">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-medium py-1">Recorded</th>
              <th className="font-medium py-1">BMI</th>
              <th className="font-medium py-1">Category</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map(d => (
              <tr key={d._id} className="border-t border-gray-50">
                <td className="py-1 text-gray-600">
                  {new Date(d.createdAt).toLocaleString("en-SG", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
                  })}
                </td>
                <td className="py-1 text-gray-900 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{d.bmi}</td>
                <td className="py-1 text-gray-600">{bmiCategory(d.bmi)?.label ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---- BMICard (public) -------------------------------------------

interface BMICardProps {
  bmi: number | null;
}

export function BMICard({ bmi }: BMICardProps) {
  const cat = bmiCategory(bmi);
  return (
    <div className={cls("rounded-2xl border-2 shadow-sm p-5", cat ? cls(cat.bg, cat.border) : "bg-white border-gray-100")}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-gray-900">Your BMI</h3>
        {cat && (
          <span className={cls("px-2.5 py-0.5 rounded-full text-xs font-bold border", cat.bg, cat.text, cat.border)}>
            {cat.label} - {cat.risk}
          </span>
        )}
      </div>
      {bmi !== null && cat ? (
        <>
          <div className="flex items-end gap-3">
            <div className={cls("text-5xl font-black leading-none", cat.text)}>{bmi}</div>
            <div className="pb-1 text-xs text-gray-500">Body Mass Index</div>
          </div>
          <BMIBar bmi={bmi} />
          <p className="mt-3 text-xs text-gray-600 leading-relaxed">{cat.advice}</p>
        </>
      ) : (
        <p className="text-sm text-gray-500">Enter your height and weight below to see your BMI.</p>
      )}
    </div>
  );
}
