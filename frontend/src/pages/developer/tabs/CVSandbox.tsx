import { Camera } from "lucide-react";
import type { TestId } from "../../../types";

interface CVSandboxProps {
  onLaunch: (id: TestId) => void;
}

const TESTS: ReadonlyArray<TestId> = ["chair_stand", "back_scratch", "sit_reach"];

export default function CVSandbox({ onLaunch }: CVSandboxProps) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <Camera size={15} className="text-violet-400" /> CV pipeline sandbox
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Run the live CV WebSocket pipeline against synthetic / de-identified test data.
          The frontend sends a <code className="text-violet-400">sandbox: true</code> flag in the init message
          so the Python service does not write to live patient records.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {TESTS.map(id => (
            <button key={id} type="button" onClick={() => onLaunch(id)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-left">
              <Camera size={14} className="text-violet-400 mb-2" />
              <div className="text-xs font-semibold text-slate-200">{id.replace(/_/g, " ")}</div>
              <div className="text-xs text-slate-500 mt-1">Launch sandbox session</div>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-500">
        CV-sandbox runs are logged in technical logs. No frames are persisted; outcomes write to the developer audit category only.
      </div>
    </div>
  );
}
