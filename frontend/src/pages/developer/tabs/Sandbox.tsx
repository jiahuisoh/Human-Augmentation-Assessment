import { useState } from "react";
import { Code, Cpu, CheckCircle, AlertTriangle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { auditApi } from "../../../utils/api";
import type { User } from "../../../types";

interface SandboxResult {
  success: boolean;
  txHash: string;
  gasUsed: number;
  event: string;
  amount: number;
}

interface SandboxProps {
  user: User;
}

const INPUT_CLS =
  "w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono " +
  "focus:border-violet-500 focus:outline-none placeholder-slate-600";

export default function Sandbox({ user }: SandboxProps) {
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [runs, setRuns]     = useState(0);

  const runTest = async (): Promise<void> => {
    setRuns(r => r + 1);
    const ok = Math.random() > 0.2;
    const r: SandboxResult = {
      success: ok,
      txHash: "0x" + Math.random().toString(16).slice(2, 18) + "...",
      gasUsed: Math.floor(Math.random() * 50000 + 20000),
      event: "TokenMinted",
      amount: 25,
    };
    setResult(r);
    await auditApi.write({
      actorId: user._id, actorRole: "developer", category: "CONTRACT", level: ok ? "INFO" : "WARN",
      message: `Developer token-logic sandbox test #${runs + 1} ${ok ? "passed" : "failed"}`,
      context: { sandbox: true, txHash: r.txHash, gasUsed: r.gasUsed },
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Code size={15} className="text-violet-400" /> Token logic sandbox
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="evt" className="block text-xs text-slate-400 mb-1">Event type</label>
            <select id="evt" className={INPUT_CLS} defaultValue="assessment_complete">
              <option value="assessment_complete">assessment_complete</option>
              <option value="session_attended">session_attended</option>
              <option value="adherence_milestone">adherence_milestone</option>
            </select>
          </div>
          <div>
            <label htmlFor="uid" className="block text-xs text-slate-400 mb-1">Test user ID (de-identified)</label>
            <input id="uid" className={INPUT_CLS} placeholder="test_user_sandbox_001" defaultValue="test_user_sandbox_001" />
          </div>
          <div>
            <label htmlFor="amt" className="block text-xs text-slate-400 mb-1">Token amount</label>
            <input id="amt" type="number" className={INPUT_CLS} defaultValue="25" />
          </div>
          <div>
            <label htmlFor="liv" className="block text-xs text-slate-400 mb-1">Liveness score (0.0–1.0)</label>
            <input id="liv" type="number" step="0.01" className={INPUT_CLS} defaultValue="0.85" />
          </div>
        </div>
        <button type="button" onClick={() => void runTest()}
          className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 text-violet-100 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          <Cpu size={15} /> Run sandbox test #{runs + 1}
        </button>
      </div>

      {result && (
        <div className={cls(
          "bg-slate-900 border rounded-lg p-4 font-mono text-xs",
          result.success ? "border-emerald-800" : "border-red-900",
        )}>
          <div className="flex items-center gap-2 mb-3">
            {result.success
              ? <><CheckCircle size={14} className="text-emerald-400" /><span className="text-emerald-400 font-semibold">SANDBOX PASS</span></>
              : <><AlertTriangle size={14} className="text-red-400" /><span className="text-red-400 font-semibold">SANDBOX FAIL</span></>}
          </div>
          <div className="space-y-1 text-slate-400">
            <div><span className="text-slate-600">txHash  </span>{result.txHash}</div>
            <div><span className="text-slate-600">event   </span><span className="text-violet-400">{result.event}</span></div>
            <div><span className="text-slate-600">amount  </span><span className="text-emerald-400">+{result.amount} tokens</span></div>
            <div><span className="text-slate-600">gasUsed </span>{result.gasUsed}</div>
            <div><span className="text-slate-600">env     </span><span className="text-amber-400">SANDBOX (not live)</span></div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-xs text-slate-500">
        <div className="text-slate-400 font-semibold mb-2">Sandbox rules</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>All tests use de-identified synthetic data only</li>
          <li>Sandbox tokens are not minted on the live blockchain</li>
          <li>Access to live patient records is prohibited by RBAC</li>
          <li>Smart-contract deployment to production requires administrator approval</li>
        </ul>
      </div>
    </div>
  );
}
