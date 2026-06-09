import { type ChangeEvent, useState } from "react";
import { Upload, ShieldCheck, Trash2, AlertCircle } from "lucide-react";
import { cls } from "../../../utils/helpers";
import { TESTS } from "../../../utils/constants";
import { submissionApi } from "../../../utils/api";
import type { TestId, User, VideoSubmission } from "../../../types";

interface VideoAssessmentProps {
  user: User;
  submissions: VideoSubmission[];
  onChange: () => Promise<void>;
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB — sanity cap for the demo
const ACCEPTED_TYPES  = "video/mp4,video/webm,video/quicktime";

export default function VideoAssessment({ user, submissions, onChange }: VideoAssessmentProps) {
  const [testId, setTestId]       = useState<TestId>("chair_stand");
  const [file, setFile]           = useState<File | null>(null);
  const [consent, setConsent]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true): void => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3500);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    if (f.size > MAX_VIDEO_BYTES) {
      showToast(`File too large (max ${MAX_VIDEO_BYTES / 1024 / 1024} MB).`, false);
      return;
    }
    setFile(f);
  };

  const submit = async (): Promise<void> => {
    if (!file)    { showToast("Pick a video first.", false); return; }
    if (!consent) { showToast("Please confirm consent before uploading.", false); return; }
    setUploading(true);
    try {
      await submissionApi.submitVideo({
        clientId: user._id,
        testId,
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.type || "video/mp4",
        file,
      });
      setFile(null);
      setConsent(false);
      await onChange();
      showToast("Video submitted for clinician review.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", false);
    } finally {
      setUploading(false);
    }
  };

  const removeSubmission = async (id: string): Promise<void> => {
    try {
      await submissionApi.deleteOwn(id, user._id);
      await onChange();
      showToast("Submission removed.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete.", false);
    }
  };

  const pending = submissions.filter(s => s.status === "pending");
  const selectedTest = TESTS.find(t => t.id === testId);

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
        <h3 className="text-base font-semibold text-gray-900 mb-1">Submit a video</h3>
        <p className="text-xs text-gray-400 mb-4">
          Record yourself doing the test at home, then upload. Your clinician will review and confirm the result.
          Camera footage is stored securely off-chain.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="va-test" className="block text-xs font-medium text-gray-500 mb-1">Which test?</label>
            <select id="va-test" value={testId} onChange={e => setTestId(e.target.value as TestId)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-violet-500 focus:outline-none">
              {TESTS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {selectedTest && (
              <p className="text-xs text-amber-700 mt-1.5 flex items-start gap-1.5">
                <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                {selectedTest.safetyNote}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="va-file" className="block text-xs font-medium text-gray-500 mb-1">Video file (max 50 MB)</label>
            <input id="va-file" type="file" accept={ACCEPTED_TYPES} onChange={onPick}
              className="block w-full text-xs text-gray-500
                file:mr-3 file:py-2 file:px-3
                file:rounded-lg file:border-0
                file:text-xs file:font-semibold
                file:bg-violet-50 file:text-violet-700
                hover:file:bg-violet-100" />
            {file && (
              <p className="text-xs text-gray-500 mt-1">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>

          <label htmlFor="va-consent" className="flex items-start gap-2 cursor-pointer bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900">
            <input id="va-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
            <span className="flex-1 flex items-start gap-1.5">
              <ShieldCheck size={13} className="text-violet-600 flex-shrink-0 mt-0.5" />
              I consent to uploading this video for my assigned clinician to review.
              Video is stored off-chain on Singapore servers and is not shared with third parties.
            </span>
          </label>

          <button type="button" onClick={() => void submit()} disabled={!file || !consent || uploading}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            <Upload size={14} /> {uploading ? "Uploading…" : "Submit for review"}
          </button>
        </div>

        {pending.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Pending — you can still remove these</h4>
            {pending.map(s => (
              <div key={s._id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-900">{s.fileName}</div>
                  <div className="text-xs text-gray-400">{new Date(s.submittedAt).toLocaleDateString("en-SG")}</div>
                </div>
                <button type="button" onClick={() => void removeSubmission(s._id)}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium">
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
