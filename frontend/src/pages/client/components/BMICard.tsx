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

function BMIBar({ bmi }: { bmi: number }) {
  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-full overflow-hidden flex">
        {ZONES.map(z => <div key={z.label} className={cls("h-full", z.bg)} style={{ width: z.width }} />)}
        <div className="absolute top-0 bottom-0 w-1.5 bg-gray-900 rounded-full border border-white"
          style={{ left: `calc(${bmiToPercent(bmi)}% - 3px)` }} />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-400 font-mono">
        <span>15</span><span>18.5</span><span>23</span><span>27.5</span><span>40+</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Singapore / Asian BMI classification (HPB)</p>
    </div>
  );
}

// ---- BMIChart (exported, reusable) -------------------------------

interface BMIChartProps { data: Measurement[] }

export function BMIChart({ data }: BMIChartProps) {
  if (data.length < 2) {
    return <p className="text-xs text-gray-400 italic">Save at least 2 measurements to see your trend.</p>;
  }
  const W = 280, H = 100, PL = 28, PR = 8, PT = 8, PB = 22;
  const IW = W - PL - PR, IH = H - PT - PB;
  const vals = data.map(d => d.bmi);
  const minV = Math.max(10, Math.min(...vals) - 2);
  const maxV = Math.min(50, Math.max(...vals) + 2);
  const toX = (i: number) => PL + (i / (data.length - 1)) * IW;
  const toY = (v: number) => PT + IH - ((v - minV) / (maxV - minV)) * IH;
  const pts = data.map((d, i) => `${toX(i)},${toY(d.bmi)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <text x={PL - 4} y={toY(maxV) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{maxV.toFixed(0)}</text>
      <text x={PL - 4} y={toY(minV) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{minV.toFixed(0)}</text>
      <polyline points={pts} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d._id}>
          <circle cx={toX(i)} cy={toY(d.bmi)} r="3.5" fill="#7c3aed" stroke="white" strokeWidth="1.5" />
          <text x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {new Date(d.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
          </text>
        </g>
      ))}
    </svg>
  );
}

export const BMI_ZONES = ZONES;

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
            {cat.label} — {cat.risk}
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
