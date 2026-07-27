import { Camera } from "lucide-react";
import { TESTS } from "../utils/constants";
import type { TestId } from "../types";

interface CvSandboxLauncherProps {
  onLaunch: (id: TestId) => void;
}

/**
 * Shared by the developer and administrator consoles: run the real CV pipeline
 * against a synthetic subject to confirm the system works, without touching a
 * client record.
 */
export default function CvSandboxLauncher({ onLaunch }: CvSandboxLauncherProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Camera size={15} className="text-violet-600" /> CV pipeline sandbox
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Runs the live camera, WebSocket and pose pipeline against synthetic demographics.
          The <code className="text-violet-600">sandbox</code> flag travels inside the grant the
          backend signs, so the result is marked synthetic at the source and the backend refuses
          to save it against any client.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {TESTS.map(t => (
            <button key={t.id} type="button" onClick={() => onLaunch(t.id)}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-4 text-left transition-colors">
              <Camera size={14} className="text-violet-600 mb-2" />
              <div className="text-xs font-semibold text-gray-900">{t.name}</div>
              <div className="text-xs text-gray-500 mt-1">Launch sandbox session</div>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-500">
        Sandbox runs are written to the technical audit categories. No frames are persisted and no
        assessment record is created.
      </div>
    </div>
  );
}
